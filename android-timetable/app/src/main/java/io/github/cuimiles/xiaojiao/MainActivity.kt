package io.github.cuimiles.xiaojiao

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID

private val Ink = Color(0xFF273449)
private val Muted = Color(0xFF758196)
private val Rule = Color(0xFFE7EBF0)
private val TodayWash = Color(0xFFF2F7FF)
private val Accent = Color(0xFF527FB6)
private const val INSTALL_URL = "http://10.184.17.163:8767/"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.WHITE
        window.navigationBarColor = android.graphics.Color.WHITE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.isNavigationBarContrastEnforced = false
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        setContent { XiaojiaoApp { visible ->
            if (visible) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } }
    }
}

@Composable
private fun XiaojiaoApp(onLoginVisible: (Boolean) -> Unit) {
    val context = LocalContext.current
    val repository = remember { ScheduleRepository(context) }
    var data by remember { mutableStateOf(runCatching { repository.load() }.getOrDefault(ScheduleData())) }
    var error by remember { mutableStateOf<String?>(null) }
    var login by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var about by remember { mutableStateOf(false) }
    var editor by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Course?>(null) }
    var selected by remember { mutableStateOf<CourseBlock?>(null) }
    var deleteCandidate by remember { mutableStateOf<Course?>(null) }
    var installDialog by remember { mutableStateOf(false) }
    val preferences = remember { context.getSharedPreferences("settings", 0) }
    var installUrl by remember { mutableStateOf(preferences.getString("install_url", INSTALL_URL).orEmpty()) }
    val scope = rememberCoroutineScope()
    val initial = CalendarRules.weekOf(CalendarRules.today()).coerceIn(1, 18) - 1
    val pager = rememberPagerState(initialPage = initial, pageCount = { 18 })

    fun save(next: ScheduleData) {
        runCatching { repository.save(next) }
            .onSuccess { data = next; error = null }
            .onFailure { error = it.message ?: "保存课表失败" }
    }

    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openOutputStream(uri)?.use { it.write(ScheduleCodec.encode(data).toByteArray(Charsets.UTF_8)) }
                ?: error("无法写入文件")
        }.onFailure { error = "导出失败：${it.message}" }
    }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching {
            val source = context.contentResolver.openInputStream(uri) ?: error("无法读取文件")
            val bytes = source.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(output.size() + count <= 2_000_000) { "课表文件过大" }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            ScheduleCodec.decode(bytes.toString(Charsets.UTF_8))
        }.onSuccess(::save).onFailure { error = "导入失败：${it.message}" }
    }

    LaunchedEffect(login) { onLoginVisible(login) }
    DisposableEffect(Unit) { onDispose { onLoginVisible(false) } }
    MaterialTheme(colorScheme = lightColorScheme(primary = Accent, onSurface = Ink, surface = Color.White, background = Color.White)) {
        Surface(color = Color.White, modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            if (login) {
                SchoolLogin(onImported = { courses ->
                    save(repository.mergeRemote(data, courses))
                    if (error == null) login = false
                }, onClose = { login = false })
            } else {
                Column(Modifier.fillMaxSize()) {
                    ScheduleToolbar(
                        week = pager.currentPage + 1,
                        onRefresh = { login = true },
                        onToday = { scope.launch { pager.animateScrollToPage(initial) } },
                        onAdd = { editing = null; editor = true },
                        onMore = { menu = true },
                    )
                    Box(Modifier.fillMaxSize()) {
                        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                            WeekGrid(week = page + 1, data = data, onCourse = { selected = it })
                        }
                        if (data.courses.isEmpty()) {
                            Column(
                                modifier = Modifier.align(Alignment.Center).padding(24.dp)
                                    .clip(RoundedCornerShape(16.dp)).background(Color.White).padding(20.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Text("导入课表", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                                Text("输入学号或手机号和密码，自动获取课程", color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center)
                                Button(onClick = { login = true }) { Text("登录西交大教务网") }
                                TextButton(onClick = { editing = null; editor = true }) { Text("手动新建课程") }
                            }
                        }
                    }
                }
            }
        }
        if (menu) AlertDialog(
            onDismissRequest = { menu = false }, title = { Text("更多") },
            text = { Column {
                MenuRow("导出课表") { menu = false; export.launch("小交课表-2026秋.json") }
                MenuRow("导入课表") { menu = false; import.launch(arrayOf("application/json", "text/plain")) }
                MenuRow("下载 / 更新安装包") { menu = false; installDialog = true }
                MenuRow("关于小交课表") { menu = false; about = true }
            } },
            confirmButton = { TextButton(onClick = { menu = false }) { Text("关闭") } },
        )
        if (about) AlertDialog(
            onDismissRequest = { about = false }, title = { Text("小交课表") },
            text = { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Image(painterResource(R.drawable.xiaojiao_logo), null, Modifier.size(132.dp))
                Spacer(Modifier.height(8.dp))
                Text("作者：西交研一", color = Ink)
                Text("2026 秋 · 本地课表", color = Muted, fontSize = 12.sp)
            } },
            confirmButton = { TextButton(onClick = { about = false }) { Text("关闭") } },
        )
        if (installDialog) AlertDialog(
            onDismissRequest = { installDialog = false }, title = { Text("下载安装包") },
            text = { Column {
                Text("手机与电脑连接同一局域网后，打开下方地址下载新版本。", fontSize = 13.sp, color = Muted)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(value = installUrl, onValueChange = { installUrl = it }, label = { Text("局域网下载地址") }, singleLine = true)
            } },
            confirmButton = { TextButton(onClick = {
                val uri = Uri.parse(installUrl.trim())
                if (uri.scheme == "http" && uri.host != null) {
                    preferences.edit().putString("install_url", installUrl.trim()).apply()
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                        .onFailure { error = "无法打开浏览器" }
                    installDialog = false
                } else error = "请输入有效的 http:// 局域网地址"
            }) { Text("打开") } },
            dismissButton = { TextButton(onClick = { installDialog = false }) { Text("取消") } },
        )
        if (editor) CourseEditor(initial = editing, onDismiss = { editor = false }, onSave = { course ->
            save(data.copy(courses = data.courses.filterNot { it.id == course.id } + course))
            if (error == null) editor = false
        })
        selected?.let { block ->
            val course = data.courses.firstOrNull { it.id == block.first.course.id }
            if (course != null) CourseDetails(block = block, onDismiss = { selected = null },
                onEdit = { editing = course; selected = null; editor = true },
                onDelete = { deleteCandidate = course; selected = null })
        }
        deleteCandidate?.let { course ->
            AlertDialog(onDismissRequest = { deleteCandidate = null }, title = { Text("删除课程？") },
                text = { Text(course.name) },
                confirmButton = { TextButton(onClick = {
                    save(data.copy(courses = data.courses.filterNot { it.id == course.id },
                        adjustments = data.adjustments.filterNot { it.courseId == course.id }))
                    deleteCandidate = null
                }) { Text("删除") } },
                dismissButton = { TextButton(onClick = { deleteCandidate = null }) { Text("取消") } })
        }
        error?.let { msg ->
            AlertDialog(onDismissRequest = { error = null }, title = { Text("操作未完成") },
                text = { Text(msg) }, confirmButton = { TextButton(onClick = { error = null }) { Text("知道了") } })
        }
    }
}

@Composable
private fun MenuRow(label: String, onClick: () -> Unit) {
    Text(label, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 13.dp), fontSize = 15.sp)
}

@Composable
private fun ScheduleToolbar(week: Int, onRefresh: () -> Unit, onToday: () -> Unit, onAdd: () -> Unit, onMore: () -> Unit) {
    val start = CalendarRules.dateOf(week, 1)
    val end = start.plusDays(6)
    val thisWeek = week == CalendarRules.weekOf(CalendarRules.today())
    Row(modifier = Modifier.fillMaxWidth().height(54.dp).padding(start = 10.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("第 $week 周${if (thisWeek) " · 本周" else " · 非本周"}", color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
            Text("${start.year}.${start.monthValue}.${start.dayOfMonth}–${end.monthValue}.${end.dayOfMonth}", color = Muted, fontSize = 11.sp)
        }
        IconButton(onClick = onRefresh, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.Refresh, "刷新课表", tint = Ink, modifier = Modifier.size(22.dp)) }
        IconButton(onClick = onToday, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.Today, "回到本周", tint = Ink, modifier = Modifier.size(22.dp)) }
        IconButton(onClick = onAdd, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.Add, "新建课程", tint = Ink, modifier = Modifier.size(24.dp)) }
        IconButton(onClick = onMore, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.MoreHoriz, "更多", tint = Ink, modifier = Modifier.size(24.dp)) }
    }
}

@Composable
private fun WeekGrid(week: Int, data: ScheduleData, onCourse: (CourseBlock) -> Unit) {
    val today = CalendarRules.today()
    val todayColumn = if (CalendarRules.weekOf(today) == week) today.dayOfWeek.value else 0
    var now by remember { mutableStateOf(LocalTime.now(ZoneId.of("Asia/Shanghai"))) }
    LaunchedEffect(week) { while (true) { now = LocalTime.now(ZoneId.of("Asia/Shanghai")); delay(60_000) } }
    val blocks = remember(data, week) { ScheduleEngine.blocks(ScheduleEngine.occurrences(data, week)) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val timeWidth = 34.dp
        val dayWidth = (maxWidth - timeWidth) / 7
        val headerHeight = 43.dp
        val rowHeight = maxOf(70.dp, (maxHeight - headerHeight) / 11)
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().height(headerHeight).background(Color.White)) {
                Box(Modifier.width(timeWidth).fillMaxHeight(), contentAlignment = Alignment.Center) {
                    Text("${CalendarRules.dateOf(week, 1).monthValue}月", fontSize = 10.sp, color = Muted)
                }
                (1..7).forEach { day ->
                    val date = CalendarRules.dateOf(week, day)
                    Column(Modifier.width(dayWidth).fillMaxHeight().background(if (day == todayColumn) TodayWash else Color.White),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(CalendarRules.dayNames[day - 1], fontSize = 11.sp, color = if (day == todayColumn) Accent else Muted)
                        Text("${date.dayOfMonth}", fontSize = 15.sp, color = if (day == todayColumn) Accent else Ink,
                            fontWeight = if (day == todayColumn) FontWeight.Bold else FontWeight.Medium)
                    }
                }
            }
            val scroll = rememberScrollState()
            Box(Modifier.fillMaxSize().verticalScroll(scroll)) {
                Box(Modifier.fillMaxWidth().height(rowHeight * 11)) {
                    Canvas(Modifier.fillMaxSize()) {
                        val timePx = timeWidth.toPx()
                        val dayPx = dayWidth.toPx()
                        val rowPx = rowHeight.toPx()
                        if (todayColumn > 0) {
                            drawRect(TodayWash, topLeft = Offset(timePx + (todayColumn - 1) * dayPx, 0f),
                                size = Size(dayPx, size.height))
                        }
                        for (i in 0..11) drawLine(Rule, Offset(0f, i * rowPx),
                            Offset(size.width, i * rowPx), 0.6.dp.toPx())
                        for (i in 0..7) {
                            val x = timePx + i * dayPx
                            drawLine(Rule, Offset(x, 0f), Offset(x, size.height), 0.5.dp.toPx())
                        }
                    }
                    (1..11).forEach { section ->
                        val time = CalendarRules.slots(CalendarRules.dateOf(week, 1))[section - 1].substringBefore('-')
                        Column(Modifier.offset(y = rowHeight * (section - 1)).width(timeWidth).height(rowHeight).padding(top = 6.dp),
                            horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("$section", fontSize = 12.sp, color = Ink, fontWeight = FontWeight.Medium)
                            Text(time, fontSize = 8.sp, color = Muted)
                        }
                    }
                    blocks.forEach { block ->
                        val day = block.first.date.dayOfWeek.value
                        val palette = PastelPalette.forCourse(block.first.course)
                        val height = rowHeight * (block.end - block.start + 1) - 3.dp
                        Column(
                            modifier = Modifier.offset(x = timeWidth + dayWidth * (day - 1) + 1.dp,
                                    y = rowHeight * (block.start - 1) + 1.dp)
                                .width(dayWidth - 2.dp).height(height)
                                .clip(RoundedCornerShape(5.dp)).background(Color(palette.background))
                                .clickable { onCourse(block) }.padding(start = 4.dp, end = 2.dp, top = 5.dp, bottom = 2.dp),
                        ) {
                            Text(block.first.course.name, fontSize = 12.sp, lineHeight = 14.sp, color = Color(palette.text),
                                fontWeight = FontWeight.SemiBold, maxLines = if (height > 100.dp) 4 else 2,
                                overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(3.dp))
                            if (height > 85.dp && block.first.room.isNotBlank())
                                Text(block.first.room, fontSize = 9.sp, lineHeight = 11.sp, color = Color(palette.text),
                                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    val position = if (todayColumn > 0) CalendarRules.nowRowPosition(week, now) else null
                    if (position != null) Canvas(
                        Modifier.offset(x = timeWidth + dayWidth * (todayColumn - 1), y = rowHeight * position)
                            .width(dayWidth).height(4.dp)
                    ) {
                        drawLine(Color(0xFFE97771), Offset(0f, 2.dp.toPx()),
                            Offset(size.width, 2.dp.toPx()), 2.dp.toPx(), cap = StrokeCap.Round)
                    }
                }
            }
        }
    }
}

@Composable
private fun CourseDetails(block: CourseBlock, onDismiss: () -> Unit, onEdit: () -> Unit, onDelete: () -> Unit) {
    val c = block.first.course
    val date = block.first.date
    AlertDialog(onDismissRequest = onDismiss, title = { Text(c.name) },
        text = { Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text("星期${CalendarRules.dayNames[c.weekday - 1]} · 第 ${block.start}–${block.end} 节", color = Ink)
            Text("${date.monthValue}月${date.dayOfMonth}日  ${CalendarRules.timeRange(date, block.sections)}", color = Muted)
            Text("第 ${compactRange(c.weeks)} 周", color = Muted)
            if (block.first.room.isNotBlank()) Text("教室  ${block.first.room}")
            if (c.teachers.isNotEmpty()) Text("教师  ${c.teachers.joinToString("、")}")
            if (c.note.isNotBlank()) Text("备注  ${c.note}")
        } },
        confirmButton = { TextButton(onClick = onEdit) { Text("编辑") } },
        dismissButton = { Row {
            TextButton(onClick = onDelete) { Text("删除", color = Color(0xFFB45252)) }
            TextButton(onClick = onDismiss) { Text("关闭") }
        } },
    )
}

private fun compactRange(numbers: List<Int>): String {
    val sorted = numbers.sorted()
    if (sorted.isEmpty()) return ""
    val groups = mutableListOf<MutableList<Int>>()
    sorted.forEach { value ->
        if (groups.lastOrNull()?.lastOrNull() == value - 1) groups.last().add(value)
        else groups.add(mutableListOf(value))
    }
    return groups.joinToString(",") { if (it.size == 1) "${it.first()}" else "${it.first()}-${it.last()}" }
}

private fun parseNumbers(value: String, maximum: Int): List<Int>? {
    if (!value.matches(Regex("[0-9,，、\\s\\-－—~～]+"))) return null
    val result = sortedSetOf<Int>()
    value.split(Regex("[,，、\\s]+")).filter { it.isNotBlank() }.forEach { part ->
        val match = Regex("^(\\d+)(?:[-－—~～](\\d+))?$").matchEntire(part) ?: return null
        val start = match.groupValues[1].toIntOrNull() ?: return null
        val end = match.groupValues[2].ifBlank { match.groupValues[1] }.toIntOrNull() ?: return null
        if (start !in 1..maximum || end !in start..maximum) return null
        result.addAll(start..end)
    }
    return result.toList().takeIf { it.isNotEmpty() }
}

@Composable
private fun CourseEditor(initial: Course?, onDismiss: () -> Unit, onSave: (Course) -> Unit) {
    var name by remember(initial?.id) { mutableStateOf(initial?.name.orEmpty()) }
    var weekday by remember(initial?.id) { mutableIntStateOf(initial?.weekday ?: 3) }
    var sections by remember(initial?.id) { mutableStateOf(initial?.sections?.let(::compactRange) ?: "3-4") }
    var weeks by remember(initial?.id) { mutableStateOf(initial?.weeks?.let(::compactRange) ?: "1-8") }
    var teacher by remember(initial?.id) { mutableStateOf(initial?.teachers?.joinToString("、").orEmpty()) }
    var room by remember(initial?.id) { mutableStateOf(initial?.room.orEmpty()) }
    var note by remember(initial?.id) { mutableStateOf(initial?.note.orEmpty()) }
    var color by remember(initial?.id) { mutableStateOf(initial?.color ?: "mint") }
    var localError by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新建课程" else "编辑课程") },
        text = { Column(Modifier.fillMaxWidth().heightIn(max = 490.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (initial == null) TextButton(onClick = {
                name = "体育"; weekday = 3; sections = "3-4"; weeks = "1-8"; color = "mint"
            }) { Text("使用体育课模板：周三 3–4 节，第 1–8 周") }
            OutlinedTextField(name, { name = it }, label = { Text("课程名 *") }, singleLine = true)
            Text("星期", fontSize = 12.sp, color = Muted)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                (1..7).forEach { day ->
                    FilterChip(selected = weekday == day, onClick = { weekday = day }, label = { Text(CalendarRules.dayNames[day - 1]) })
                }
            }
            OutlinedTextField(sections, { sections = it }, label = { Text("节次 *，如 3-4") }, singleLine = true)
            OutlinedTextField(weeks, { weeks = it }, label = { Text("周次 *，如 1-8,10") }, singleLine = true)
            OutlinedTextField(teacher, { teacher = it }, label = { Text("教师") }, singleLine = true)
            OutlinedTextField(room, { room = it }, label = { Text("教室") }, singleLine = true)
            OutlinedTextField(note, { note = it }, label = { Text("备注") }, maxLines = 3)
            Text("颜色", fontSize = 12.sp, color = Muted)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PastelPalette.all.forEach { shade ->
                    Box(Modifier.size(if (color == shade.id) 31.dp else 27.dp)
                        .clip(CircleShape).background(Color(shade.background))
                        .clickable { color = shade.id }, contentAlignment = Alignment.Center) {
                        if (color == shade.id) Text("✓", color = Color(shade.text), fontSize = 14.sp)
                    }
                }
            }
            if (localError.isNotBlank()) Text(localError, color = Color(0xFFB45252), fontSize = 12.sp)
        } },
        confirmButton = { TextButton(onClick = {
            val parsedSections = parseNumbers(sections, 11)
            val parsedWeeks = parseNumbers(weeks, 18)
            when {
                name.trim().isBlank() -> localError = "请输入课程名"
                parsedSections == null -> localError = "节次格式无效，请用 3-4 或 3,4"
                parsedWeeks == null -> localError = "周次格式无效，请用 1-8 或 1,3,5"
                else -> onSave(Course(
                    id = initial?.id ?: "manual-${UUID.randomUUID()}", name = name.trim(), weekday = weekday,
                    sections = parsedSections, weeks = parsedWeeks,
                    className = initial?.className.orEmpty(), teachers = teacher.split(Regex("[,，、]+")).map(String::trim).filter(String::isNotBlank),
                    room = room.trim(), note = note.trim(), color = color,
                ))
            }
        }) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
