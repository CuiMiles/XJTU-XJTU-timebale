package io.github.cuimiles.xiaojiao

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

private class WheelState(argb: Long) {
    private val hsv = FloatArray(3).also { AndroidColor.colorToHSV(argb.toInt(), it) }
    var hue by mutableFloatStateOf(hsv[0])
    var saturation by mutableFloatStateOf(hsv[1])
    var brightness by mutableFloatStateOf(hsv[2])
    var opacity by mutableFloatStateOf(((argb ushr 24) and 0xFF).toFloat() / 255f)

    fun argb(): Long = AndroidColor.HSVToColor(
        (opacity * 255).roundToInt().coerceIn(0, 255),
        floatArrayOf(hue, saturation, brightness),
    ).toLong() and 0xFFFFFFFFL
}

private fun colorWheelImage() = run {
    val side = 300
    val center = (side - 1) / 2f
    val pixels = IntArray(side * side)
    for (y in 0 until side) for (x in 0 until side) {
        val dx = x - center
        val dy = y - center
        val radius = sqrt(dx * dx + dy * dy) / center
        if (radius <= 1f) {
            val hue = ((Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())) + 360.0) % 360.0).toFloat()
            pixels[y * side + x] = AndroidColor.HSVToColor(floatArrayOf(hue, radius, 1f))
        }
    }
    Bitmap.createBitmap(pixels, side, side, Bitmap.Config.ARGB_8888).asImageBitmap()
}

@Composable
private fun ColorWheel(state: WheelState) {
    val image = remember { colorWheelImage() }
    Canvas(Modifier.size(222.dp).pointerInput(state) {
        fun choose(point: Offset) {
            val dx = point.x - size.width / 2f
            val dy = point.y - size.height / 2f
            val radius = min(size.width, size.height) / 2f
            state.hue = ((Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())) + 360.0) % 360.0).toFloat()
            state.saturation = (sqrt(dx * dx + dy * dy) / radius).coerceIn(0f, 1f)
        }
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            choose(down.position)
            down.consume()
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (!change.pressed) break
                choose(change.position)
                change.consume()
            }
        }
    }) {
        drawImage(image, dstSize = IntSize(size.width.roundToInt(), size.height.roundToInt()),
            filterQuality = FilterQuality.Medium)
        val angle = Math.toRadians(state.hue.toDouble())
        val radius = (size.minDimension / 2f - 11.dp.toPx()) * state.saturation
        val marker = Offset(
            center.x + (cos(angle) * radius).toFloat(),
            center.y + (sin(angle) * radius).toFloat(),
        )
        drawCircle(Color.White, radius = 11.dp.toPx(), center = marker)
        drawCircle(Color(state.argb()).copy(alpha = 1f), radius = 8.dp.toPx(), center = marker)
        drawCircle(Color(0xFF35445B), radius = 11.dp.toPx(), center = marker,
            style = Stroke(width = 1.5.dp.toPx()))
    }
}

@Composable
fun ColorWheelDialog(
    initialColor: String?,
    courseName: String,
    room: String,
    onDismiss: () -> Unit,
    onApply: (String) -> Unit,
) {
    val initialArgb = PastelPalette.byId(initialColor)?.background
        ?: PastelPalette.byId("soft-sky")!!.background
    val wheel = remember(initialColor) { WheelState(initialArgb) }
    val preview = PastelPalette.byId(PastelPalette.custom(wheel.argb()))!!
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("调色盘") },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 485.dp).verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("在圆盘上拖动选色", color = Color(0xFF758196), fontSize = 12.sp)
                Spacer(Modifier.height(10.dp))
                ColorWheel(wheel)
                Spacer(Modifier.height(14.dp))
                Box(Modifier.fillMaxWidth().background(Color(0xFFF2F7FF), RoundedCornerShape(10.dp)).padding(5.dp)) {
                    Column(Modifier.fillMaxWidth().background(Color(preview.background), RoundedCornerShape(7.dp))
                        .padding(horizontal = 10.dp, vertical = 9.dp)) {
                        Text(courseName.ifBlank { "课程预览" }, color = Color(preview.text),
                            fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (room.isNotBlank()) Text(room, color = Color(preview.text), fontSize = 10.sp,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("深浅", color = Color(0xFF273449), fontSize = 13.sp)
                    Text("${(wheel.brightness * 100).roundToInt()}%", color = Color(0xFF758196), fontSize = 12.sp)
                }
                Slider(value = wheel.brightness, onValueChange = { wheel.brightness = it }, valueRange = 0.3f..1f)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("透明度", color = Color(0xFF273449), fontSize = 13.sp)
                    Text("${((1f - wheel.opacity) * 100).roundToInt()}%", color = Color(0xFF758196), fontSize = 12.sp)
                }
                Slider(value = 1f - wheel.opacity, onValueChange = { wheel.opacity = 1f - it })
            }
        },
        confirmButton = { TextButton(onClick = { onApply(PastelPalette.custom(wheel.argb())) }) { Text("应用") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
