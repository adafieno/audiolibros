# Guía Integral del Flujo de Trabajo de Producción y Publicación de Audiolibros con Voces Sintéticas

**Contexto:** Este documento describe paso a paso cómo producir un audiolibro con tecnología de síntesis de voz (Azure TTS) y publicarlo en múltiples plataformas: **Apple Books, Google Play Books, Spotify**, y opcionalmente **Audible** a través del programa **KDP Virtual Voice**. El enfoque combina velocidad, acceso y un toque humano en la dirección creativa.

---

## 1. Preparación inicial

1. **Texto fuente:** Partir del manuscrito final (ej. `Puntajada.docx`).
2. **Brief de intención creativa:** Documento breve que especifique propósito, audiencia, emociones y reglas culturales.
3. **Biblia del Libro (JSON):** Documento maestro que centraliza todos los elementos creativos y técnicos. Incluye:
   - Metadatos del libro (título, idioma, autores, sinopsis, estructura de capítulos).
   - Intención creativa y lineamientos culturales.
   - Diseño narrativo (resumen, ambientación, temas).
   - Lista de personajes con biografías y relaciones.
   - **Sección de voces**: narrador base y perfiles detallados de personajes (voz, timbre, ritmo, pitch, emociones, notas culturales).
   - Lexicón de términos y pronunciaciones (IPA o reglas fonéticas).
   - Paquetes de estilos SSML (pausas, énfasis, susurros, punch lines).
   - Parámetros de producción de audio (frecuencia, bit depth, loudness targets).
   - Reglas de QA (índice de toque humano, criterios de control de calidad).
   - Reglas de entrega (formatos por plataforma, portadas, metadatos).
   - Créditos y roles humanos (director de narración, editor cultural, ingeniero de audio).
   - **Reglas de segmentación**: duración máxima por bloque (8 minutos), voces por bloque (≤ 40 `<voice>`), tamaño SSML (≤ 50 KB). Estos parámetros se aplican al dividir capítulos en subsegmentos seguros para Azure TTS.

Este archivo JSON actúa como **fuente única de verdad** y se utiliza a lo largo de todo el flujo de trabajo.

---

## 2. Segmentación y anotación en SSML (XML)

- Dividir el manuscrito en capítulos y, si son largos, en **subsegmentos** de ≤ 8 minutos de narración estimada (basado en `pace_wpm_range` de la biblia).
- Generar directamente **archivos SSML en XML** con el contenido de cada subsegmento.
- Asignar voces y estilos basados en la **Biblia del Libro** (sección `voices`).
- Controlar límites: ≤ 40 `<voice>` por bloque y SSML ≤ 50 KB para compatibilidad con Azure.
- Ejemplo:
  ```xml
  <speak xml:lang="es-PE" xmlns="http://www.w3.org/2001/10/synthesis">
    <voice name="es-ES-ElviraNeural"> <!-- Narrador -->
      <p><s>Comienza la historia en Lima...</s></p>
    </voice>
    <voice name="es-MX-DaliaNeural"> <!-- Lucía -->
      <p><s>“No puedo creerlo” dijo Lucía con sorpresa.</s></p>
    </voice>
  </speak>
  ```

---

## 3. Síntesis en Azure TTS

- Configuración de salida: **WAV, 44.1 kHz, 16-bit, mono**.
- Generar un archivo WAV por **subsegmento**.
- Unir subsegmentos para reconstruir cada capítulo completo.
- Si un capítulo excede los límites, usar **Batch TTS** de Azure en lugar de tiempo real.

---

## 4. Masterización y control de calidad

- Normalizar niveles: RMS entre **−23 y −18 dBFS**, picos ≤ **−3 dBFS**, piso de ruido ≤ **−60 dBFS**.
- Revisión humana:
  - Pronunciaciones según lexicón de la biblia.
  - Pausas y naturalidad según stylepacks.
  - Coherencia cultural.
  - Consistencia en el uso de perfiles de voz.
  - Transiciones suaves entre subsegmentos (fades o crossfades si es necesario).
- Ajustar SSML y re-renderizar solo fragmentos necesarios.

---

## 5. Exportación por plataforma

### A) Apple Books
- **Formato:** `.m4b (AAC)` con capítulos integrados.
- **Herramienta:** `m4b-tool`.
- **Portada:** 3000×3000 px, RGB.
- **Carga:** vía **Books/Authors Connect**.

### B) Google Play Books
- **Formatos:** MP3 (≥128 kbps mono, ≥256 kbps estéreo), M4A/AAC, FLAC o WAV (≥44.1 kHz, 16-bit).
- **Recomendado:** MP3 256 kbps CBR estéreo.
- **Portada:** 3000×3000 px, RGB.
- **Carga:** vía **Partner Center**.

### C) Spotify
- **Formatos:** MP3, WAV o FLAC.
- **Recomendado:** MP3 256 kbps CBR estéreo.
- **Portada:** 3000×3000 px.
- **Carga:** vía **Spotify for Authors**.
- **Nota:** marcar **“Narración con voz digital”**.

### D) Audible (Route A: KDP Virtual Voice)
- **Requisito:** eBook publicado en KDP.
- **Proceso:**
  1. En el Bookshelf de KDP → **“Add Audiobook with Virtual Voice”**.
  2. Elegir voz.
  3. Editar pronunciaciones/pausas.
  4. Establecer precio ($3.99–$14.99).
  5. Publicar.
- **Distribución:** Amazon, Audible, Alexa, Amazon Music Unlimited.
- **Etiqueta:** “Narración con voz digital”.

---

## 6. Entregables finales

| Plataforma      | Formato principal  | Capítulos         | Portada          | Notas especiales |
|-----------------|-------------------|------------------|-----------------|-----------------|
| Apple Books     | .m4b (AAC)        | Integrados       | 3000×3000 px    | Subir en Books Connect |
| Google Play     | MP3/FLAC/WAV      | Por archivo      | 3000×3000 px    | CBR preferido |
| Spotify         | MP3/WAV/FLAC      | Por archivo      | 3000×3000 px    | Marcar voz digital |
| Audible (KDP)   | Generado por KDP  | Automático       | Desde KDP       | Solo vía Virtual Voice beta |

---

## 7. Buenas prácticas para el “toque humano”

- **Prólogo/Epílogo humano:** Breve mensaje del autor o director.
- **Interludios sonoros:** Efectos sutiles o firma auditiva (ej. “Echo of Memory”).
- **Control cultural:** Validación local de expresiones y pronunciaciones.
- **QA humano:** Al menos dos escuchas por capítulo.
- **Uso de múltiples voces:** La narración con distintos perfiles de voz humaniza la historia.
- **Segmentación consciente:** Cortar capítulos largos en subsegmentos ≤ 8 minutos, cuidando no romper escenas críticas.

---

## 8. Carpeta sugerida del proyecto
```
/puntajada
  /manuscript/Puntajada.docx
  /biblia/biblia_libro.json
  /ssml/*.xml
  /audio/wav/
  /deliverables/apple/
  /deliverables/google/
  /deliverables/spotify/
  /qa/
  /admin/sku_map.json
```

---

## 9. Hoja de control de publicación

- [ ] Manuscrito final editado y validado.
- [ ] Brief de intención creativa redactado.
- [ ] **Biblia del Libro (JSON) completada**, con narrador y perfiles de personajes.
- [ ] Lexicón revisado y aprobado.
- [ ] Archivos SSML (XML) generados por capítulo y subsegmento.
- [ ] Cada bloque SSML cumple los límites: ≤ 8 min, ≤ 40 voces, ≤ 50 KB.
- [ ] Archivos WAV (44.1 kHz, 16-bit) generados en Azure TTS.
- [ ] Subsegmentos unidos correctamente en capítulos.
- [ ] Masterización aplicada (niveles RMS, picos, ruido).
- [ ] Exportación Apple (`.m4b`) lista.
- [ ] Exportación Google (MP3/FLAC/WAV) lista.
- [ ] Exportación Spotify (MP3/WAV/FLAC) lista.
- [ ] Portadas 3000×3000 px generadas y validadas.
- [ ] KDP Virtual Voice habilitado y configurado (si aplica).
- [ ] Declaración de narración digital incluida en metadatos.
- [ ] QA humano completado (pronunciaciones, ritmo, naturalidad).
- [ ] Registro de SKU/IDs actualizado en `sku_map.json`.

---

## 10. Conclusión

Este flujo de trabajo, apoyado en la **Biblia del Libro como archivo maestro**, permite producir audiolibros con voces sintéticas de forma eficiente y profesional, equilibrando velocidad y acceso con un toque humano indispensable. Considera además los **límites técnicos de Azure TTS** para segmentar correctamente el SSML en bloques manejables, garantizando calidad y estabilidad en la síntesis. El resultado: un mismo manuscrito disponible en las principales plataformas globales (Apple Books, Google Play Books, Spotify y Audible), en formatos optimizados y cumpliendo con todas las normas técnicas y éticas vigentes.

