package io.github.cuimiles.xiaojiao

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Palette
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.content.ContextCompat
import androidx.core.content.pm.PackageInfoCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID

private val Ink = Color(0xFF273449)
private val Muted = Color(0xFF758196)
private val TodayWash = Color(0xFFF2F7FF)
private val Accent = Color(0xFF527FB6)

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
    val credentialVault = remember { CredentialVault(context) }
    var data by remember { mutableStateOf(runCatching { repository.load() }.getOrDefault(ScheduleData())) }
    var error by remember { mutableStateOf<String?>(null) }
    var login by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var weekPicker by remember { mutableStateOf(false) }
    var paletteOpen by remember { mutableStateOf(false) }
    var paletteCourseName by remember { mutableStateOf<String?>(null) }
    var about by remember { mutableStateOf(false) }
    var editor by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Course?>(null) }
    var selected by remember { mutableStateOf<CourseBlock?>(null) }
    var deleteCandidate by remember { mutableStateOf<Course?>(null) }
    var updateDialog by remember { mutableStateOf(false) }
    val preferences = remember { context.getSharedPreferences("settings", 0) }
    val installedPackage = remember { context.packageManager.getPackageInfo(context.packageName, 0) }
    val installedVersionCode = remember { PackageInfoCompat.getLongVersionCode(installedPackage).toInt() }
    val installedVersionName = remember { installedPackage.versionName.orEmpty() }
    var availableVersion by remember {
        val code = preferences.getInt("available_version_code", 0)
        val name = preferences.getString("available_version_name", "").orEmpty()
        val apk = preferences.getString("available_version_apk", "").orEmpty()
        val digest = preferences.getString("available_version_sha256", "").orEmpty()
        mutableStateOf(if (code > installedVersionCode &&
            preferences.getString("available_version_source", null) == CAMPUS_SERVER_URL &&
            apk == "xiaojiao-timetable-$name.apk" && digest.matches(Regex("[0-9a-f]{64}")))
            ReleaseInfo(code, name, apk, digest) else null)
    }
    var updateChecking by remember { mutableStateOf(false) }
    var updateDownloading by remember { mutableStateOf(false) }
    var updateProgress by remember { mutableIntStateOf(0) }
    var updateStatus by remember { mutableStateOf("") }
    var pendingApk by remember { mutableStateOf<File?>(null) }
    val scope = rememberCoroutineScope()
    val initial = CalendarRules.weekOf(CalendarRules.today()).coerceIn(1, 18) - 1
    val pager = rememberPagerState(initialPage = initial, pageCount = { 18 })

    fun save(next: ScheduleData) {
        val migrated = PastelPalette.migrateLegacyDefaults(next.courses)
        val prepared = next.copy(courses = PastelPalette.assignDefaults(migrated))
        runCatching { repository.save(prepared) }
            .onSuccess { data = prepared; error = null }
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
    fun saveProfileToGallery() {
        runCatching { GallerySaver.saveProfile(context) }
            .onSuccess { Toast.makeText(context, "已保存到相册", Toast.LENGTH_SHORT).show() }
            .onFailure { error = "保存到相册失败：${it.message}" }
    }
    val galleryPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) saveProfileToGallery() else error = "请允许保存图片到相册"
    }
    val installPermission = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val apk = pendingApk
        if (apk != null && context.packageManager.canRequestPackageInstalls()) {
            runCatching { UpdateDownloader.startInstaller(context, apk) }
                .onFailure { updateStatus = "无法打开安装界面，请重试。" }
        } else updateStatus = "请允许小交课表安装应用，然后点击“安装更新”。"
    }

    fun saveAvailable(release: ReleaseInfo?) {
        availableVersion = release
        val edit = preferences.edit()
        if (release == null) edit.remove("available_version_code").remove("available_version_name")
            .remove("available_version_apk").remove("available_version_sha256")
            .remove("available_version_source")
        else edit.putInt("available_version_code", release.versionCode)
            .putString("available_version_name", release.versionName)
            .putString("available_version_apk", release.apk)
            .putString("available_version_sha256", release.sha256)
            .putString("available_version_source", CAMPUS_SERVER_URL)
        edit.apply()
    }

    fun installDownloaded() {
        val apk = pendingApk ?: return
        if (!apk.isFile) {
            pendingApk = null
            updateStatus = "安装包已清理，请重新下载。"
            return
        }
        if (context.packageManager.canRequestPackageInstalls()) {
            runCatching { UpdateDownloader.startInstaller(context, apk) }
                .onFailure { updateStatus = "无法打开安装界面，请重试。" }
        } else runCatching {
            installPermission.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")))
        }.onFailure { updateStatus = "请在系统设置中允许小交课表安装应用。" }
    }

    fun checkUpdates(manual: Boolean) {
        if (updateChecking || updateDownloading) return
        val now = System.currentTimeMillis()
        if (!manual && !UpdatePolicy.shouldAutoCheck(
                preferences.getLong("update_last_attempt", 0),
                preferences.getString("update_last_source", null), CAMPUS_SERVER_URL, now)) return
        preferences.edit().remove("install_url").putLong("update_last_attempt", now)
            .putString("update_last_source", CAMPUS_SERVER_URL).apply()
        updateChecking = true
        updateStatus = "正在检查新版本…"
        scope.launch {
            try {
                val release = withContext(Dispatchers.IO) { UpdateChecker.fetch() }
                if (UpdatePolicy.isNewer(release, installedVersionCode)) {
                    if (availableVersion?.versionCode != release.versionCode) pendingApk = null
                    saveAvailable(release)
                    updateStatus = "发现新版本 ${release.versionName}（当前 $installedVersionName）"
                } else {
                    pendingApk = null
                    saveAvailable(null)
                    updateStatus = "当前已是最新版（$installedVersionName）"
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                updateStatus = "检查失败，请确认已连接校园网。"
            } finally {
                updateChecking = false
            }
        }
    }

    fun downloadUpdate() {
        if (updateDownloading || updateChecking) return
        updateDownloading = true
        updateProgress = 0
        updateStatus = "正在下载更新…"
        scope.launch {
            try {
                val release = withContext(Dispatchers.IO) { UpdateChecker.fetch() }
                if (!UpdatePolicy.isNewer(release, installedVersionCode)) {
                    pendingApk = null
                    saveAvailable(null)
                    updateStatus = "当前已是最新版（$installedVersionName）"
                    return@launch
                }
                saveAvailable(release)
                val apk = UpdateDownloader.download(context, release) { updateProgress = it }
                pendingApk = apk
                updateStatus = "下载完成，正在打开安装界面…"
                installDownloaded()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                updateStatus = failure.message ?: "下载失败，请确认已连接校园网。"
            } finally {
                updateDownloading = false
            }
        }
    }

    fun closeUpdateDialog() {
        updateDialog = false
        updateStatus = ""
    }

    LaunchedEffect(login) { onLoginVisible(login) }
    LaunchedEffect(Unit) { checkUpdates(manual = false) }
    LaunchedEffect(Unit) {
        val now = System.currentTimeMillis()
        if (FirstOpenReporter.shouldAttempt(preferences.getBoolean("activation_acknowledged", false),
                preferences.getLong("activation_last_attempt", 0), now)) {
            val installId = preferences.getString("activation_install_id", null)
                ?: UUID.randomUUID().toString().also {
                    preferences.edit().putString("activation_install_id", it).apply()
                }
            preferences.edit().putLong("activation_last_attempt", now).apply()
            val sent = withContext(Dispatchers.IO) {
                runCatching { FirstOpenReporter.report(installId, installedVersionCode) }.isSuccess
            }
            if (sent) preferences.edit().putBoolean("activation_acknowledged", true).apply()
        }
    }
    DisposableEffect(Unit) { onDispose { onLoginVisible(false) } }
    MaterialTheme(colorScheme = lightColorScheme(primary = Accent, onSurface = Ink, surface = Color.White, background = Color.White)) {
        Surface(color = Color.White, modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            if (login) {
                SchoolLogin(credentialVault = credentialVault, onError = { error = it }, onImported = { courses ->
                    save(repository.mergeRemote(data, courses))
                    if (error == null) login = false
                }, onClose = { login = false })
            } else {
                Column(Modifier.fillMaxSize()) {
                    ScheduleToolbar(
                        week = pager.currentPage + 1,
                        onWeekClick = { weekPicker = true },
                        onRefresh = { login = true },
                        onToday = { scope.launch { pager.animateScrollToPage(CalendarRules.weekOf(CalendarRules.today()).coerceIn(1, 18) - 1) } },
                        onAdd = { editing = null; editor = true },
                        onPalette = { paletteCourseName = null; paletteOpen = true },
                        onMore = { menu = true },
                        hasUpdate = availableVersion != null,
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
                MenuRow(if (availableVersion != null) "有新版本" else "检查更新") {
                    menu = false
                    updateDialog = true
                    if (availableVersion == null) checkUpdates(manual = true)
                }
                MenuRow("清除已存登录信息") { credentialVault.clear(); menu = false }
                MenuRow("关于小交课表") { menu = false; about = true }
            } },
            confirmButton = { TextButton(onClick = { menu = false }) { Text("关闭") } },
        )
        if (paletteOpen) {
            val chosenCourse = data.courses.firstOrNull { it.name == paletteCourseName }
            if (chosenCourse == null) AlertDialog(
                onDismissRequest = { paletteOpen = false }, title = { Text("调色盘") },
                text = {
                    Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                        Text("选择课程", color = Muted, fontSize = 13.sp)
                        val colors = PastelPalette.resolve(data.courses)
                        data.courses.distinctBy { it.name }.forEach { course ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                .clickable { paletteCourseName = course.name }
                                .padding(vertical = 9.dp, horizontal = 5.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(25.dp).clip(CircleShape)
                                    .background(Color(colors.getValue(course.id).background)))
                                Spacer(Modifier.width(10.dp))
                                Text(course.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("›", color = Muted, fontSize = 20.sp)
                            }
                        }
                        if (data.courses.isEmpty()) Text("新建或导入课程后即可调色", color = Muted)
                    }
                },
                confirmButton = { TextButton(onClick = { paletteOpen = false }) { Text("关闭") } },
            ) else ColorWheelDialog(
                initialColor = PastelPalette.resolve(data.courses).getValue(chosenCourse.id).id,
                courseName = chosenCourse.name,
                room = chosenCourse.room,
                onDismiss = { paletteCourseName = null },
                onApply = { color ->
                    save(data.copy(courses = data.courses.map {
                        if (it.name == chosenCourse.name) it.copy(color = color) else it
                    }))
                    if (error == null) { paletteOpen = false; paletteCourseName = null }
                },
            )
        }
        if (weekPicker) AlertDialog(
            onDismissRequest = { weekPicker = false },
            title = { Text("选择周次") },
            text = {
                val currentWeek = CalendarRules.weekOf(CalendarRules.today())
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier.fillMaxWidth().height(342.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items((1..18).toList()) { targetWeek ->
                        val firstDay = CalendarRules.dateOf(targetWeek, 1)
                        val selected = targetWeek == pager.currentPage + 1
                        Column(
                            modifier = Modifier.clip(RoundedCornerShape(9.dp))
                                .background(if (selected) TodayWash else Color(0xFFF7F9FC))
                                .clickable {
                                    weekPicker = false
                                    scope.launch { pager.animateScrollToPage(targetWeek - 1) }
                                }.padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("第 $targetWeek 周", fontSize = 14.sp,
                                color = if (selected || targetWeek == currentWeek) Accent else Ink,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
                            Text(if (targetWeek == currentWeek) "本周 · ${firstDay.monthValue}.${firstDay.dayOfMonth}"
                                else "${firstDay.monthValue}.${firstDay.dayOfMonth}",
                                fontSize = 10.sp, color = Muted)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { weekPicker = false }) { Text("取消") } },
        )
        if (about) AlertDialog(
            onDismissRequest = { about = false }, title = { Text("关于小交课表") },
            text = { Column(horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                Image(painterResource(R.drawable.xiaohongshu_profile), "作者的小红书主页二维码",
                    Modifier.fillMaxWidth().aspectRatio(987f / 1347f), contentScale = ContentScale.Fit)
                Spacer(Modifier.height(8.dp))
                Text("有建议或反馈，欢迎来小红书交流。", color = Muted, fontSize = 12.sp)
            } },
            confirmButton = { TextButton(onClick = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
                    ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED)
                    saveProfileToGallery()
                else galleryPermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }) { Text("保存到相册") } },
            dismissButton = { TextButton(onClick = { about = false }) { Text("关闭") } },
        )
        if (updateDialog) AlertDialog(
            onDismissRequest = { if (!updateDownloading) closeUpdateDialog() },
            title = { Text(if (availableVersion != null) "有新版本" else "检查更新") },
            text = { Column {
                Text(when {
                    updateDownloading -> "正在下载更新：$updateProgress%"
                    updateChecking -> "正在检查新版本…"
                    updateStatus.isNotBlank() -> updateStatus
                    availableVersion != null -> "发现新版本 ${availableVersion?.versionName}（当前 $installedVersionName）"
                    else -> "当前版本 $installedVersionName"
                }, fontSize = 13.sp, color = Ink)
                if (updateDownloading) {
                    Spacer(Modifier.height(10.dp))
                    LinearProgressIndicator(progress = { updateProgress / 100f }, modifier = Modifier.fillMaxWidth())
                }
                Spacer(Modifier.height(7.dp))
                Text("连接校园网即可在 App 内下载；安装时需在系统界面确认。", fontSize = 12.sp, color = Muted)
                TextButton(onClick = { checkUpdates(manual = true) }, enabled = !updateChecking && !updateDownloading,
                    modifier = Modifier.align(Alignment.End)) { Text("重新检查") }
            } },
            confirmButton = { if (availableVersion != null || pendingApk != null) TextButton(
                onClick = { if (pendingApk != null) installDownloaded() else downloadUpdate() },
                enabled = !updateChecking && !updateDownloading,
            ) { Text(if (pendingApk != null) "安装更新" else "下载更新") } },
            dismissButton = { TextButton(onClick = ::closeUpdateDialog, enabled = !updateDownloading) { Text("关闭") } },
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
private fun ScheduleToolbar(week: Int, onWeekClick: () -> Unit, onRefresh: () -> Unit,
    onToday: () -> Unit, onAdd: () -> Unit, onPalette: () -> Unit,
    onMore: () -> Unit, hasUpdate: Boolean) {
    val start = CalendarRules.dateOf(week, 1)
    val end = start.plusDays(6)
    var today by remember { mutableStateOf(CalendarRules.today()) }
    LaunchedEffect(Unit) { while (true) { today = CalendarRules.today(); delay(60_000) } }
    val thisWeek = week == CalendarRules.weekOf(today)
    Row(modifier = Modifier.fillMaxWidth().height(54.dp).padding(start = 10.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).clickable(onClick = onWeekClick)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("第 $week 周${if (thisWeek) " · 周${CalendarRules.dayNames[today.dayOfWeek.value - 1]}" else " · 非本周"}",
                    color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                Icon(Icons.Outlined.ExpandMore, "选择周次", tint = Muted, modifier = Modifier.size(15.dp))
            }
            Text("${start.year}.${start.monthValue}.${start.dayOfMonth}–${end.monthValue}.${end.dayOfMonth}", color = Muted, fontSize = 11.sp)
        }
        IconButton(onClick = onRefresh, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.Refresh, "刷新课表", tint = Ink, modifier = Modifier.size(22.dp)) }
        IconButton(onClick = onToday, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.Today, "回到本周", tint = Ink, modifier = Modifier.size(22.dp)) }
        IconButton(onClick = onAdd, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.Add, "新建课程", tint = Ink, modifier = Modifier.size(24.dp)) }
        IconButton(onClick = onPalette, modifier = Modifier.size(38.dp)) { Icon(Icons.Outlined.Palette, "调色盘", tint = Ink, modifier = Modifier.size(23.dp)) }
        Box(Modifier.size(38.dp)) {
            IconButton(onClick = onMore, modifier = Modifier.fillMaxSize()) {
                Icon(Icons.Outlined.MoreHoriz, "更多", tint = Ink, modifier = Modifier.size(24.dp))
            }
            if (hasUpdate) Box(Modifier.align(Alignment.TopEnd).offset(x = (-2).dp, y = 3.dp)
                .size(8.dp).clip(CircleShape).background(Color(0xFFE46B6B)))
        }
    }
}

@Composable
private fun WeekGrid(week: Int, data: ScheduleData, onCourse: (CourseBlock) -> Unit) {
    val today = CalendarRules.today()
    val todayColumn = if (CalendarRules.weekOf(today) == week) today.dayOfWeek.value else 0
    var now by remember { mutableStateOf(LocalTime.now(ZoneId.of("Asia/Shanghai"))) }
    LaunchedEffect(week) { while (true) { now = LocalTime.now(ZoneId.of("Asia/Shanghai")); delay(60_000) } }
    val blocks = remember(data, week) { ScheduleEngine.blocks(ScheduleEngine.occurrences(data, week)) }
    val colors = remember(data.courses) { PastelPalette.resolve(data.courses) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val timeWidth = 34.dp
        val dayWidth = (maxWidth - timeWidth) / 7
        val headerHeight = 43.dp
        val rowHeight = maxOf(70.dp, (maxHeight - headerHeight) / 11)
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().height(headerHeight - 1.dp).background(Color.White)) {
                Box(Modifier.width(timeWidth).fillMaxHeight(), contentAlignment = Alignment.Center) {
                    Text("${CalendarRules.dateOf(week, 1).monthValue}月", fontSize = 12.sp, color = Muted)
                }
                (1..7).forEach { day ->
                    val date = CalendarRules.dateOf(week, day)
                    Column(Modifier.width(dayWidth).fillMaxHeight().background(if (day == todayColumn) TodayWash else Color.White),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(CalendarRules.dayNames[day - 1], fontSize = 10.sp, lineHeight = 12.sp,
                            color = if (day == todayColumn) Accent else Muted)
                        Spacer(Modifier.height(1.dp))
                        Text("${date.dayOfMonth}", fontSize = 12.sp, lineHeight = 14.sp,
                            color = if (day == todayColumn) Accent else Ink,
                            fontWeight = if (day == todayColumn) FontWeight.Bold else FontWeight.Medium)
                    }
                }
            }
            HorizontalDivider(thickness = 1.dp, color = Color(0xFFE9EDF2))
            val scroll = rememberScrollState()
            Box(Modifier.fillMaxSize().verticalScroll(scroll)) {
                Box(Modifier.fillMaxWidth().height(rowHeight * 11)) {
                    Canvas(Modifier.fillMaxSize()) {
                        val timePx = timeWidth.toPx()
                        val dayPx = dayWidth.toPx()
                        if (todayColumn > 0) {
                            drawRect(TodayWash, topLeft = Offset(timePx + (todayColumn - 1) * dayPx, 0f),
                                size = Size(dayPx, size.height))
                        }
                    }
                    (1..11).forEach { section ->
                        val slot = CalendarRules.slots(if (todayColumn > 0) today else CalendarRules.dateOf(week, 1))[section - 1]
                        Column(Modifier.offset(y = rowHeight * (section - 1)).width(timeWidth).height(rowHeight).padding(top = 6.dp),
                            horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("$section", fontSize = 12.sp, color = Ink, fontWeight = FontWeight.Medium)
                            Text(slot.substringBefore('-'), fontSize = 8.sp, lineHeight = 10.sp, color = Muted)
                            Text(slot.substringAfter('-'), fontSize = 8.sp, lineHeight = 10.sp, color = Muted)
                        }
                    }
                    blocks.forEach { block ->
                        val day = block.first.date.dayOfWeek.value
                        val palette = colors.getValue(block.first.course.id)
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
    var color by remember(initial?.id) { mutableStateOf(initial?.color ?: "soft-mint") }
    var pickerOpen by remember(initial?.id) { mutableStateOf(false) }
    var localError by remember { mutableStateOf("") }
    if (pickerOpen) ColorWheelDialog(
        initialColor = color,
        courseName = name,
        room = room,
        onDismiss = { pickerOpen = false },
        onApply = { color = it; pickerOpen = false },
    ) else AlertDialog(onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新建课程" else "编辑课程") },
        text = { Column(Modifier.fillMaxWidth().heightIn(max = 490.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (initial == null) TextButton(onClick = {
                name = "体育"; weekday = 3; sections = "3-4"; weeks = "1-8"; color = "soft-mint"
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
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween) {
                Text("颜色", fontSize = 12.sp, color = Muted)
                TextButton(onClick = { pickerOpen = true }) {
                    Box(Modifier.size(25.dp).clip(CircleShape)
                        .background(Color(PastelPalette.byId(color)!!.background)))
                    Spacer(Modifier.width(8.dp))
                    Text("调色盘")
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
