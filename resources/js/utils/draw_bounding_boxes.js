import classes from "./yolo_classes.json";

/**
 * Draw bounding boxes in overlay canvas.
 * @param {Array[Object]} predictions - Bounding boxes, class and score objects
 * @param {HTMLCanvasElement} overlay_el - Show boxes in overlay canvas element.
 */
export async function draw_bounding_boxes(predictions, overlay_el) {
  const ctx = overlay_el.getContext("2d");

  // Clear the canvas
  ctx.clearRect(0, 0, overlay_el.width, overlay_el.height);

  // Calculate diagonal length of the canvas
  const diagonalLength = Math.sqrt(
    Math.pow(overlay_el.width, 2) + Math.pow(overlay_el.height, 2)
  );
  const lineWidth = diagonalLength / 250;

  // Draw boxes and labels
  predictions.forEach((predict) => {
    // Get color for the class
    const color = Colors.getColor(predict.class_idx, 0.2); // get color with 20% transparency
    const borderColor = Colors.getColor(predict.class_idx, 0.8);
    const rgbaFillColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    const rgbaBorderColor = `rgba(${borderColor[0]}, ${borderColor[1]}, ${borderColor[2]}, ${borderColor[3]})`;

    const [x1, y1, width, height] = predict.bbox;

    // Draw filled rectangle with transparency
    ctx.fillStyle = rgbaFillColor;
    ctx.fillRect(x1, y1, width, height);

    // Draw border
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = rgbaBorderColor;
    ctx.strokeRect(x1, y1, width, height);

    // Draw text and background
    ctx.fillStyle = rgbaBorderColor;
    ctx.font = "16px Arial";
    const text = `${classes.class[predict.class_idx]} ${predict.score.toFixed(
      2
    )}`;
    const textWidth = ctx.measureText(text).width;
    const textHeight = parseInt(ctx.font, 10);

    // Calculate the Y position for the text
    let textY = y1 - 5;
    let rectY = y1 - textHeight - 4;

    // Check if the text will be outside the canvas
    if (rectY < 0) {
      // Adjust the Y position to be inside the canvas
      textY = y1 + textHeight + 5;
      rectY = y1 + 1;
    }

    ctx.fillRect(x1 - 1, rectY, textWidth + 4, textHeight + 4);
    ctx.fillStyle = "white";
    ctx.fillText(text, x1, textY);
  });
}

/**
 * Ultralytics default color palette https://ultralytics.com/.
 *
 * This class provides methods to work with the Ultralytics color palette, including converting hex color codes to
 * RGB values.
 */
class Colors {
  static palette = [
    "042AFF",
    "0BDBEB",
    "F3F3F3",
    "00DFB7",
    "111F68",
    "FF6FDD",
    "FF444F",
    "CCED00",
    "00F344",
    "BD00FF",
    "00B4FF",
    "DD00BA",
    "00FFFF",
    "26C000",
    "01FFB3",
    "7D24FF",
    "7B0068",
    "FF1B6C",
    "FC6D2F",
    "A2FF0B",
  ].map((c) => Colors.hex2rgba(`#${c}`));
  static n = Colors.palette.length;
  static cache = {}; // Cache for colors

  static hex2rgba(h, alpha = 1.0) {
    return [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16),
      alpha,
    ];
  }

  static getColor(i, alpha = 1.0, bgr = false) {
    const key = `${i}-${alpha}-${bgr}`;
    if (Colors.cache[key]) {
      return Colors.cache[key];
    }
    const c = Colors.palette[i % Colors.n];
    const rgba = [...c.slice(0, 3), alpha];
    const result = bgr ? [rgba[2], rgba[1], rgba[0], rgba[3]] : rgba;
    Colors.cache[key] = result;
    return result;
  }
}
// import classes from "./yolo_classes.json";

// // A simple utility object for managing colors based on class index.
// const Colors = {
//   palette: ["#FF3838", "#FF9D97", "#FF701F", "#FFB21D", "#CFD231", "#48F90A", "#92CC17", "#3DDB86", "#1A9334", "#00D4BB", "#2C99A8", "#00C2FF", "#344593", "#6473FF", "#0018EC", "#8438FF", "#520085", "#CB38FF", "#FF95C8", "#FF37C7"],
  
//   /**
//    * Gets a color for a given class index.
//    * @param {number} classIdx - The index of the class.
//    * @param {number} alpha - The alpha transparency value (0.0 to 1.0).
//    * @returns {Array<number>} An array representing [R, G, B, alpha].
//    */
//   getColor(classIdx, alpha = 1.0) {
//     const hex = this.palette[classIdx % this.palette.length];
//     const r = parseInt(hex.slice(1, 3), 16);
//     const g = parseInt(hex.slice(3, 5), 16);
//     const b = parseInt(hex.slice(5, 7), 16);
//     return [r, g, b, alpha];
//   }
// };

// /**
//  * Draws bounding boxes and labels on the canvas based on model predictions.
//  * @param {Array<Object>} predictions - Array of prediction objects from the model.
//  * @param {HTMLCanvasElement} canvas - The canvas element to draw on.
//  */
// export function draw_bounding_boxes(predictions, canvas) {
//   const ctx = canvas.getContext("2d");

//   // Clear the canvas from previous drawings
//   ctx.clearRect(0, 0, canvas.width, canvas.height);

//   // Calculate a dynamic line width based on canvas size for scalability
//   const diagonalLength = Math.sqrt(Math.pow(canvas.width, 2) + Math.pow(canvas.height, 2));
//   const lineWidth = Math.max(1, diagonalLength / 300);

//   // Draw boxes and labels for each prediction
//   predictions.forEach((predict) => {
//     // --- FIX STARTS HERE ---
//     // The prediction object likely has a 'bbox' property, not 'box'.
//     // The bbox format is [x1, y1, width, height].
//     if (!predict.bbox) return; // Skip if no bounding box data
    
//     const [x1, y1, width, height] = predict.bbox;
//     // --- FIX ENDS HERE ---

//     // Get colors with different transparencies for fill and border
//     const color = Colors.getColor(predict.class_idx, 0.2); // 20% transparency for fill
//     const borderColor = Colors.getColor(predict.class_idx, 0.8); // 80% for border/text
//     const rgbaFillColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
//     const rgbaBorderColor = `rgba(${borderColor[0]}, ${borderColor[1]}, ${borderColor[2]}, ${borderColor[3]})`;

//     // Draw filled rectangle (the bounding box)
//     ctx.fillStyle = rgbaFillColor;
//     ctx.fillRect(x1, y1, width, height);

//     // Draw the border of the rectangle
//     ctx.lineWidth = lineWidth;
//     ctx.strokeStyle = rgbaBorderColor;
//     ctx.strokeRect(x1, y1, width, height);

//     // --- Draw text label and its background ---
//     const text = `${classes.class[predict.class_idx]} ${(predict.score * 100).toFixed(1)}%`;
    
//     // NOTE: Font size is now static. For dynamic font size, see previous implementation.
//     const fontSize = 16;
//     ctx.font = `bold ${fontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
//     const textMetrics = ctx.measureText(text);
//     const textWidth = textMetrics.width;
//     const textHeight = fontSize; 

//     // Calculate Y position for the text label, ensuring it doesn't go off-screen
//     let textY = y1 - 5;
//     let rectY = y1 - textHeight - 4;

//     // If the label would be drawn outside the top of the canvas, draw it inside the box instead
//     if (rectY < 0) {
//       textY = y1 + textHeight + 5;
//       rectY = y1 + 1;
//     }

//     // Draw the text background
//     ctx.fillStyle = rgbaBorderColor;
//     ctx.fillRect(x1 - 1, rectY, textWidth + 4, textHeight + 4);
    
//     // Draw the text itself
//     ctx.fillStyle = "#ffffff";
//     ctx.fillText(text, x1 + 2, textY);
//   });
// }