"""Parse the authenticated GMIS timetable into the mini-program's course schema."""
from __future__ import annotations

import hashlib
import re
from bs4 import BeautifulSoup

WEEKDAYS = ("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")


def _span(text: str, maximum: int) -> list[int]:
    found: set[int] = set()
    for match in re.finditer(r"(\d+)(?:\s*[-－—~～]\s*(\d+))?", text):
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if start > end or end > maximum:
            continue
        for n in range(start, end + 1):
            if "单" in text and n % 2 == 0:
                continue
            if "双" in text and n % 2:
                continue
            found.add(n)
    return sorted(found)


def _grid(table):
    grid = []
    for row_index, row in enumerate(table.find_all("tr")):
        while len(grid) <= row_index:
            grid.append([])
        column = 0
        for cell in row.find_all(["td", "th"], recursive=False):
            while column < len(grid[row_index]) and grid[row_index][column] is not None:
                column += 1
            rowspan = max(1, min(11, int(cell.get("rowspan", 1))))
            colspan = max(1, min(9, int(cell.get("colspan", 1))))
            for r in range(row_index, row_index + rowspan):
                while len(grid) <= r:
                    grid.append([])
                for c in range(column, column + colspan):
                    while len(grid[r]) <= c:
                        grid[r].append(None)
                    grid[r][c] = cell
            column += colspan
    return grid


def parse_html(html: str) -> dict:
    table = BeautifulSoup(html, "html.parser").find("table", id="tbl")
    if table is None:
        raise ValueError("timetable table missing")
    grid = _grid(table)
    weekday_columns: dict[int, int] = {}
    for row in grid:
        for col, cell in enumerate(row):
            if cell is None:
                continue
            label = cell.get_text(" ", strip=True)
            for day, name in enumerate(WEEKDAYS, 1):
                if label in (name, "周" + name[-1]):
                    weekday_columns[col] = day
    if len(weekday_columns) != 7:
        raise ValueError("weekday header missing")
    courses = []
    seen = set()
    for row in grid:
        for col, cell in enumerate(row):
            day = weekday_columns.get(col)
            if day is None or cell is None:
                continue
            text = cell.get_text("\n", strip=True).replace("\xa0", " ")
            for block in re.split(r"(?=课程[：:])", text):
                if not block.startswith("课程"):
                    continue
                values = {}
                for line in block.splitlines():
                    match = re.match(r"^(课程|班级|教师|教室|节次|周次)[：:]\s*(.*)", line.strip())
                    if match:
                        values[match.group(1)] = match.group(2).strip()
                name = values.get("课程", "")
                sections = _span(values.get("节次", ""), 11)
                weeks = _span(values.get("周次", ""), 18)
                if not name or not sections or not weeks:
                    continue
                room = values.get("教室", "")
                unique = (name, day, tuple(sections), tuple(weeks), room)
                if unique in seen:
                    continue
                seen.add(unique)
                digest = hashlib.sha256(repr(unique).encode("utf-8")).hexdigest()[:20]
                courses.append({
                    "id": "gmis-" + digest,
                    "name": name,
                    "className": values.get("班级", ""),
                    "teachers": [x for x in re.split(r"[,，、\s]+", values.get("教师", "")) if x],
                    "room": room,
                    "weekday": day,
                    "sections": sections,
                    "weeks": weeks,
                    "note": "",
                })
    if not courses:
        raise ValueError("no courses found")
    return {"schemaVersion": 1, "semesterId": "2026-fall", "courses": courses}
