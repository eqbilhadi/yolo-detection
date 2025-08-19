// /**
//  * Memotong (crop) sebuah objek dari gambar berdasarkan bounding box.
//  * @param {HTMLImageElement} originalImage - Elemen <img> gambar asli.
//  * @param {Array<number>} bbox - Bounding box [x_min, y_min, width, height] dalam koordinat tampilan.
//  * @returns {Promise<Blob>} - Promise yang resolve dengan Blob gambar hasil crop.
//  */
// export function cropObjectFromImage(originalImage, bbox) {
//   return new Promise((resolve, reject) => {
//     // 1. Dapatkan ukuran asli (natural) dari gambar
//     const naturalWidth = originalImage.naturalWidth;
//     const naturalHeight = originalImage.naturalHeight;

//     // 2. Dapatkan ukuran gambar seperti yang ditampilkan di layar (client)
//     const clientWidth = originalImage.clientWidth;
//     const clientHeight = originalImage.clientHeight;

//     // 3. Hitung faktor skala
//     const scaleX = naturalWidth / clientWidth;
//     const scaleY = naturalHeight / clientHeight;

//     // 4. Skalakan koordinat dan ukuran bounding box
//     const [x_min, y_min, width, height] = bbox;
//     const scaled_x_min = x_min * scaleX;
//     const scaled_y_min = y_min * scaleY;
//     const scaled_width = width * scaleX;
//     const scaled_height = height * scaleY;

//     // Pastikan width dan height valid
//     if (scaled_width <= 0 || scaled_height <= 0) {
//       return reject(new Error(`Bounding box tidak valid setelah diskalakan. Width: ${scaled_width}, Height: ${scaled_height}`));
//     }

//     const canvas = document.createElement('canvas');
//     const ctx = canvas.getContext('2d');

//     // Set ukuran canvas sama dengan ukuran objek yang di-crop (yang sudah diskalakan)
//     canvas.width = scaled_width;
//     canvas.height = scaled_height;

//     // Menggambar bagian spesifik dari gambar asli ke canvas menggunakan koordinat yang sudah diskalakan
//     // argumen: image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
//     ctx.drawImage(
//       originalImage,
//       scaled_x_min,
//       scaled_y_min,
//       scaled_width,
//       scaled_height,
//       0, 0,
//       scaled_width,
//       scaled_height
//     );

//     canvas.toBlob(
//       (blob) => {
//         if (blob) {
//           resolve(blob);
//         } else {
//           reject(new Error('Gagal membuat Blob dari canvas crop.'));
//         }
//       },
//       'image/jpeg',
//       0.95 // Kualitas tinggi
//     );
//   });
// }

// /**
//  * Memotong (crop) sebuah objek dari gambar berdasarkan bounding box.
//  * @param {HTMLImageElement} originalImage - Elemen <img> gambar asli.
//  * @param {Array<number>} bbox - Bounding box [x_min, y_min, width, height] dalam koordinat tampilan.
//  * @returns {Promise<Blob>} - Promise yang resolve dengan Blob gambar hasil crop.
//  */
// export function cropObjectFromImage(source, bbox) {
//   return new Promise((resolve) => {
//     const [x, y, w, h] = bbox;

//     // Buat canvas baru untuk crop
//     const canvas = document.createElement("canvas");
//     canvas.width = w;
//     canvas.height = h;
//     const ctx = canvas.getContext("2d");

//     // Ambil ukuran sumber
//     let sourceWidth, sourceHeight;
//     if (source instanceof HTMLImageElement) {
//       sourceWidth = source.naturalWidth;
//       sourceHeight = source.naturalHeight;
//     } else if (source instanceof HTMLCanvasElement || source instanceof HTMLVideoElement) {
//       sourceWidth = source.width;
//       sourceHeight = source.height;
//     } else {
//       throw new Error("Unsupported source type for cropObjectFromImage");
//     }

//     // Gambar bagian bbox ke canvas baru
//     ctx.drawImage(source, x, y, w, h, 0, 0, w, h);

//     // Convert ke blob
//     canvas.toBlob((blob) => {
//       resolve(blob);
//     }, "image/png");
//   });
// }

/**
 * Memotong (crop) sebuah objek dari gambar/canvas/video berdasarkan bounding box.
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source - Sumber gambar.
 * @param {Array<number>} bbox - Bounding box [x_min, y_min, width, height] dalam koordinat tampilan.
 * @returns {Promise<Blob>} - Promise yang resolve dengan Blob gambar hasil crop.
 */
export function cropObjectFromImage(source, bbox) {
  return new Promise((resolve, reject) => {
    let sourceWidth, sourceHeight, clientWidth, clientHeight;

    // Ambil ukuran asli & ukuran tampilan tergantung jenis sumber
    if (source instanceof HTMLImageElement) {
      sourceWidth = source.naturalWidth;
      sourceHeight = source.naturalHeight;
      clientWidth = source.clientWidth;
      clientHeight = source.clientHeight;
    } else if (source instanceof HTMLCanvasElement) {
      sourceWidth = source.width;
      sourceHeight = source.height;
      clientWidth = source.width;
      clientHeight = source.height;
    } else if (source instanceof HTMLVideoElement) {
      sourceWidth = source.videoWidth;
      sourceHeight = source.videoHeight;
      clientWidth = source.clientWidth;
      clientHeight = source.clientHeight;
    } else {
      return reject(new Error("Unsupported source type"));
    }

    // Hitung faktor skala
    const scaleX = sourceWidth / clientWidth;
    const scaleY = sourceHeight / clientHeight;

    // Skalakan bbox
    const [x_min, y_min, width, height] = bbox;
    const scaled_x_min = x_min * scaleX;
    const scaled_y_min = y_min * scaleY;
    const scaled_width = width * scaleX;
    const scaled_height = height * scaleY;

    if (scaled_width <= 0 || scaled_height <= 0) {
      return reject(new Error(`Bounding box tidak valid setelah diskalakan. Width: ${scaled_width}, Height: ${scaled_height}`));
    }

    // Buat canvas baru untuk hasil crop
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = scaled_width;
    canvas.height = scaled_height;

    // Gambar area ter-crop ke canvas
    ctx.drawImage(
      source,
      scaled_x_min,
      scaled_y_min,
      scaled_width,
      scaled_height,
      0,
      0,
      scaled_width,
      scaled_height
    );

    // Convert ke Blob
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Gagal membuat Blob dari canvas crop."));
      },
      "image/jpeg",
      0.95
    );
  });
}

