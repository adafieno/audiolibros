## 🎙️ Grabación (entrada)

### Micrófono

- Condensador cardioide (ej.: Audio-Technica AT2020, Rode NT1-A).
- Con filtro pop (para controlar “p”, “b” y soplidos).
- Colocado a 15–20 cm de la boca, ligeramente en ángulo (5–15° off-axis).

### Ambiente

- Habitación tratada o improvisación con mantas/espuma acústica.
- Apagar ventiladores, PC ruidosos o tráfico externo.

### Preamp / Interfaz

- Ganancia ajustada para que la voz llegue a -12 dBFS promedio, con picos máximos entre -6 y -3 dBFS.
- Evitar que la señal toque 0 dBFS (clipping).

## Configuración técnica (archivo de proyecto / grabación)

- Formato: WAV (sin compresión, PCM lineal).
- Resolución de bits: 24-bit (más margen dinámico y menor ruido).
- Frecuencia de muestreo: 48 kHz (estándar en video/audio profesional).
- Canales: Mono (1 canal; la voz no necesita estéreo).
- Normalización en mezcla: dejar un headroom de -3 dBFS.

Ejemplo: WAV PCM, 24-bit, 48,000 Hz, mono.

## Procesamiento básico antes de exportar

En Sonar Platinum (o cualquier DAW) aplica en cadena:
### High-Pass Filter (HPF):
- Cortar por debajo de 80–100 Hz.

### EQ correctivo: 
- Si hay plosivos, notch en 100–120 Hz (-3 a -6 dB, Q=12–15).
- Quitar “caja” si la hay: -2 dB en 250–350 Hz.
- Dar claridad: +1–2 dB en 3 kHz.
- Aire: +1 dB en 10 kHz.

### Compresor:
- Ratio 3:1.
- Threshold ~-20 dBFS.
- Attack 10 ms, Release 100 ms.
- Reducción: 2–4 dB.

### De-esser: solo si “s” suena agresiva (6–8 kHz).
- Limiter final: techo en -1.0 dBFS.

## Exportación (WAV)
### Formato:
- WAV
- Sample Rate: 48,000 Hz.
- Bit Depth: 24-bit.
- Canales: Mono.
- Dithering: activado solo si bajas de 24 a 16 bits.

