package io.github.cuimiles.xiaojiao

import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode
import java.security.MessageDigest

/** Parses only the timetable table after a successful login to GMIS. */
object GmisParser {
    private val field = Regex("^(课程|班级|教师|教室|节次|周次)[：:]\\s*(.*)")
    private val range = Regex("(\\d+)(?:\\s*[-－—~～]\\s*(\\d+))?")
    private val splitCourse = Regex("(?=课程[：:])")
    private val days = listOf("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")

    fun parse(html: String): List<Course> {
        require(html.length < 2_000_000) { "教务网返回内容过大" }
        val table = Jsoup.parse(html).selectFirst("table#tbl") ?: error("没有找到课表，请确认已登录并进入课表页")
        val grid = expand(table)
        val weekdayColumns = mutableMapOf<Int, Int>()
        grid.forEach { row -> row.forEachIndexed { column, cell ->
            val label = cell?.text()?.replace(Regex("\\s+"), "") ?: ""
            days.forEachIndexed { index, day ->
                if (label == day || label == "周${day.last()}") weekdayColumns[column] = index + 1
            }
        } }
        require(weekdayColumns.values.toSet().size == 7) { "课表星期列不完整" }
        val courses = mutableListOf<Course>()
        val seen = mutableSetOf<String>()
        grid.forEach { row -> row.forEachIndexed { column, cell ->
            val weekday = weekdayColumns[column] ?: return@forEachIndexed
            if (cell == null) return@forEachIndexed
            val text = extract(cell).replace('\u00a0', ' ')
            text.split(splitCourse).forEach { chunk ->
                if (!chunk.trimStart().startsWith("课程")) return@forEach
                val values = mutableMapOf<String, String>()
                chunk.lineSequence().forEach { line ->
                    val match = field.find(line.trim())
                    if (match != null) values[match.groupValues[1]] = match.groupValues[2].trim()
                }
                val name = values["课程"].orEmpty()
                val sections = parseSpan(values["节次"].orEmpty(), 11)
                val weeks = parseSpan(values["周次"].orEmpty(), 18)
                if (name.isBlank() || sections.isEmpty() || weeks.isEmpty()) return@forEach
                val room = values["教室"].orEmpty()
                val key = listOf(name, weekday.toString(), sections.joinToString(","), weeks.joinToString(","), room).joinToString("|")
                if (!seen.add(key)) return@forEach
                val digest = MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8))
                val id = digest.take(10).joinToString("") { "%02x".format(it.toInt() and 0xff) }
                courses.add(Course(
                    id = "gmis-$id", name = name, className = values["班级"].orEmpty(),
                    teachers = values["教师"].orEmpty().split(Regex("[,，、\\s]+" )).filter { it.isNotBlank() },
                    room = room, weekday = weekday, sections = sections, weeks = weeks,
                ))
            }
        } }
        require(courses.isNotEmpty()) { "教务网没有返回课程" }
        return courses
    }

    private fun expand(table: Element): List<List<Element?>> {
        val grid = mutableListOf<MutableList<Element?>>()
        table.select("tr").forEachIndexed { rowIndex, tr ->
            while (grid.size <= rowIndex) grid.add(mutableListOf())
            var column = 0
            tr.children().filter { it.tagName() in setOf("td", "th") }.forEach { cell ->
                while (column < grid[rowIndex].size && grid[rowIndex][column] != null) column++
                val rowSpan = (cell.attr("rowspan").toIntOrNull() ?: 1).coerceIn(1, 11)
                val colSpan = (cell.attr("colspan").toIntOrNull() ?: 1).coerceIn(1, 9)
                for (r in rowIndex until rowIndex + rowSpan) {
                    while (grid.size <= r) grid.add(mutableListOf())
                    for (c in column until column + colSpan) {
                        while (grid[r].size <= c) grid[r].add(null)
                        grid[r][c] = cell
                    }
                }
                column += colSpan
            }
        }
        return grid
    }

    private fun extract(node: Node): String = buildString {
        fun appendNode(n: Node) {
            when (n) {
                is TextNode -> append(n.wholeText)
                is Element -> {
                    if (n.tagName() == "br") { append('\n'); return }
                    n.childNodes().forEach(::appendNode)
                    if (n.tagName() in setOf("p", "div")) append('\n')
                }
            }
        }
        appendNode(node)
    }

    private fun parseSpan(text: String, maximum: Int): List<Int> = buildSet {
        range.findAll(text).forEach { match ->
            val start = match.groupValues[1].toInt()
            val end = match.groupValues[2].toIntOrNull() ?: start
            if (start > end || end > maximum) return@forEach
            for (n in start..end) {
                if ("单" in text && n % 2 == 0) continue
                if ("双" in text && n % 2 == 1) continue
                add(n)
            }
        }
    }.sorted()
}
