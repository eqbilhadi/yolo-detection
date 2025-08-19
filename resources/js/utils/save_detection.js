import { router } from '@inertiajs/vue3'
import { cropObjectFromImage } from './crop_images' // misalnya function crop ada di file ini

/**
 * Simpan hasil deteksi ke server
 * @param {Array} results - hasil prediksi model
 * @param {Object} classes - daftar class object (misal { class: [...] })
 * @param {HTMLImageElement} imgRef - reference gambar asli
 * @param {Number} threshold - ambang batas confidence
 */
export async function saveDetections(results, classes, imgRef, threshold = 0.8) {
  // Filter hasil sesuai threshold
  const highConfidenceResults = results.filter(r => r.score > threshold)
  console.log(results);
  
  // Proses crop dan format data
  const processedResults = await Promise.all(
    highConfidenceResults.map(async (predict) => {
      const className = classes.class[predict.class_idx]
      const croppedImageBlob = await cropObjectFromImage(imgRef.value, predict.bbox)

      return {
        bbox: predict.bbox,
        score: predict.score,
        confidence: (predict.score * 100).toFixed(1),
        classIdx: predict.class_idx,
        className: className,
        image: croppedImageBlob
      }
    })
  )
    console.log(processedResults);

  // Kirim ke backend kalau ada hasil
  if (processedResults.length > 0) {
    router.post(route('camera.store'), {
      detections: processedResults
    }, {
      preserveState: true,
      preserveScroll: true,
      onSuccess: () => console.log('Data berhasil dikirim dan disimpan!'),
      onError: (errors) => console.error('Terjadi error:', errors)
    })
  }
}
