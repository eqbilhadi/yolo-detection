<script setup>
import { ref, onMounted, watch, computed, nextTick } from "vue";
import { Head } from "@inertiajs/vue3";
import * as ort from "onnxruntime-web/webgpu";
import JSMpeg from "jsmpeg-player";

// Import komponen UI
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// Import utility YOLO
import * as model_loader from "@/utils/model_loader";
import { inference_pipeline } from "@/utils/inference_pipeline";
import { draw_bounding_boxes } from "@/utils/draw_bounding_boxes";
import classes from "@/utils/yolo_classes.json";

// --- Konfigurasi Model & Inferensi ---
const MODEL_CONFIG = {
  input_shape: [1, 3, 640, 640],
  tensor_topk: new ort.Tensor("int32", new Int32Array([100])),
  tensor_iou_threshold: new ort.Tensor("float32", new Float32Array([0.45])),
  tensor_score_threshold: new ort.Tensor("float32", new Float32Array([0.45])),
};

// --- State Reaktif (Reactive State) ---
const selectedDevice = ref("webgpu");
const selectedModel = ref("yolo11n-simplify-dynamic");
const customModels = ref([]);
const cameras = ref([]);
const selectedCamera = ref(null);
const cameraStream = ref(null);
const sessionsConfig = ref(null);
const imgSrc = ref(null);
const warnUpTime = ref(0);
const inferenceTime = ref(0);
const modelStatusText = ref("Model not loaded");
const isModelLoaded = ref(false);
const details = ref([]);

// State untuk stream & loop
const isCameraRunning = ref(false);
const jsmpegPlayer = ref(null);
const jsmpegLoopStarted = ref(false);
const animationFrameId = ref(null);

// Ref untuk elemen DOM
const overlayRef = ref(null);
const cameraRef = ref(null);
const imgRef = ref(null);
const inputCanvasRef = ref(null); // Canvas perantara khusus untuk webcam
const jsmpegCanvasRef = ref(null); // Canvas target untuk JSMpeg
const openImageInputRef = ref(null);
const addModelInputRef = ref(null);

// --- Computed Properties untuk UI ---
const openImageBtnText = computed(() => (imgSrc.value ? "Close Image" : "Open Image"));
const openCameraBtnText = computed(() => (isCameraRunning.value ? "Close Camera" : "Open Camera"));
const modelStatusColor = computed(() => (isModelLoaded.value ? "text-green-500" : "text-red-500"));

// --- Logika Utama ---

/**
 * Memuat model ONNX dan NMS berdasarkan backend yang dipilih.
 */
const loadModel = async () => {
  modelStatusText.value = "Loading model...";
  isModelLoaded.value = false;
  try {
    const device = selectedDevice.value;
    const modelUrl = selectedModel.value;
    const isCustom = customModels.value.some((m) => m.url === modelUrl);
    const model_path = isCustom ? modelUrl : `${window.location.origin}/models/${modelUrl}.onnx`;
    const nms_path = `${window.location.origin}/yolo-decoder.onnx`;

    const start = performance.now();
    const { yolo_model, nms } = await model_loader.model_loader(device, model_path, nms_path, MODEL_CONFIG);
    sessionsConfig.value = { yolo_model, nms, ...MODEL_CONFIG };
    const end = performance.now();

    modelStatusText.value = "Model loaded";
    isModelLoaded.value = true;
    warnUpTime.value = (end - start).toFixed(2);
  } catch (error) {
    modelStatusText.value = "Model loading failed";
    console.error(error);
  }
};

/**
 * Mendapatkan daftar kamera yang tersedia, termasuk opsi IP Camera.
 */
const getCameras = async () => {
  try {
    const customCameras = [{
      deviceId: "wss://cartoon-retrieve-pike-competitions.trycloudflare.com",
      label: "IP Camera (Stream)",
      kind: "videoinput",
    }];
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    cameras.value = [...customCameras, ...videoDevices];
    if (cameras.value.length > 0) {
      selectedCamera.value = cameras.value[0].deviceId;
    }
  } catch (error) {
    console.error("Error enumerating devices:", error);
  }
};

/**
 * Menjalankan inferensi pada gambar statis yang diunggah.
 */
const handleImageLoad = async () => {
  if (!imgRef.value || !sessionsConfig.value) return;
  overlayRef.value.width = imgRef.value.width;
  overlayRef.value.height = imgRef.value.height;
  const [results, results_inferenceTime] = await inference_pipeline(imgRef.value, sessionsConfig.value);
  details.value = results;
  inferenceTime.value = results_inferenceTime;
  draw_bounding_boxes(results, overlayRef.value);
};

/**
 * Loop deteksi utama yang berjalan setiap frame.
 * Fungsi ini cukup pintar untuk menangani input dari <video> (webcam) dan <canvas> (JSMpeg).
 */
const runDetectionLoop = async (sourceElement) => {
  if (!isCameraRunning.value) return;

  const sourceWidth = sourceElement.videoWidth || sourceElement.width;
  const sourceHeight = sourceElement.videoHeight || sourceElement.height;

  if (sourceWidth === 0 || sourceHeight === 0) {
    animationFrameId.value = requestAnimationFrame(() => runDetectionLoop(sourceElement));
    return;
  }

  if (overlayRef.value.width !== sourceWidth || overlayRef.value.height !== sourceHeight) {
    overlayRef.value.width = sourceWidth;
    overlayRef.value.height = sourceHeight;
  }

  let inferenceInput = sourceElement;
  let results = [];
  let results_inferenceTime = 0;

  // PENANGANAN KHUSUS: Webcam perlu disalin ke kanvas perantara agar aman.
  if (sourceElement.tagName === 'VIDEO') {
    const ctx = inputCanvasRef.value.getContext("2d");
    if (ctx.canvas.width !== sourceWidth || ctx.canvas.height !== sourceHeight) {
      ctx.canvas.width = sourceWidth;
      ctx.canvas.height = sourceHeight;
    }
    ctx.drawImage(sourceElement, 0, 0, sourceWidth, sourceHeight);
    inferenceInput = inputCanvasRef.value;
  }

  // =========================================================================
  // === PERUBAHAN KUNCI: Menangkap error keamanan 'Tainted Canvas' ===
  // =========================================================================
  try {
    // Untuk JSMpeg (cross-origin), baris ini akan gagal secara diam-diam
    // atau melempar error jika pustaka inferensi mencoba membaca piksel.
    [results, results_inferenceTime] = await inference_pipeline(inferenceInput, sessionsConfig.value);
  } catch (e) {
    // Jika kita sampai di sini, ini adalah BUKTI FINAL masalah CORS.
    console.error("======================================================");
    console.error("ANALISIS GAGAL: Ini adalah masalah keamanan 'Tainted Canvas' (CORS).", e);
    console.error("Browser memblokir pembacaan piksel dari stream video eksternal.");
    console.error("SOLUSI: Konfigurasi header 'Access-Control-Allow-Origin' di server stream atau gunakan proxy server.");
    console.error("======================================================");
    alert("Analisis video gagal karena kebijakan keamanan browser (CORS). Cek konsol untuk detail teknis.");
    closeAllStreams(); // Hentikan loop agar tidak error terus
    return;
  }
  // =========================================================================

  if (!isCameraRunning.value) return;

  details.value = results;
  inferenceTime.value = results_inferenceTime;
  draw_bounding_boxes(results, overlayRef.value);

  animationFrameId.value = requestAnimationFrame(() => runDetectionLoop(sourceElement));
};

/**
 * Fungsi pemicu yang memulai loop deteksi.
 */
const startDetectionLoop = (sourceElement) => {
  if (!sourceElement || !isCameraRunning.value) return;
  runDetectionLoop(sourceElement);
};

// --- Logika Kontrol Kamera ---

/**
 * Membersihkan semua stream dan state terkait kamera.
 */
const closeAllStreams = () => {
  isCameraRunning.value = false;
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  if (cameraStream.value) {
    cameraStream.value.getTracks().forEach((track) => track.stop());
    cameraStream.value = null;
  }
  if (jsmpegPlayer.value) {
    jsmpegPlayer.value.destroy();
    jsmpegPlayer.value = null;
  }
  details.value = [];
  inferenceTime.value = 0;
  nextTick(() => {
    if (overlayRef.value) {
      const ctx = overlayRef.value.getContext("2d");
      ctx.clearRect(0, 0, overlayRef.value.width, overlayRef.value.height);
    }
  });
};

/**
 * Membuka stream dari IP Camera menggunakan JSMpeg.
 */
const openIpCameraStream = async () => {
  await nextTick(); // Tunggu Vue selesai memperbarui DOM
  if (!jsmpegCanvasRef.value) {
    alert("Error: JSMpeg canvas element is not ready.");
    isCameraRunning.value = false;
    return;
  }
  try {
    jsmpegLoopStarted.value = false;
    jsmpegPlayer.value = new JSMpeg.Player(selectedCamera.value, {
      canvas: jsmpegCanvasRef.value,
      autoplay: true,
      onError: (error) => {
        console.error("JSMpeg reported an error:", error);
        alert(`Failed to connect to the video stream.`);
        closeAllStreams();
      },
      onVideoDecode: () => {
        if (isCameraRunning.value && !jsmpegLoopStarted.value) {
          jsmpegLoopStarted.value = true;
          console.log("JSMpeg video is decoding. Starting inference loop.");
          startDetectionLoop(jsmpegCanvasRef.value);
        }
      },
    });
  } catch (error) {
    console.error("Critical error initializing JSMpeg player:", error);
    closeAllStreams();
  }
};

/**
 * Membuka stream dari webcam lokal.
 */
const openWebcamStream = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: selectedCamera.value },
      audio: false,
    });
    cameraStream.value = stream;
    if (cameraRef.value) cameraRef.value.srcObject = stream;
  } catch (error) {
    console.error("Error accessing camera:", error);
    alert("Could not access the camera. Please check permissions.");
    closeAllStreams();
  }
};

/**
 * Fungsi saklar utama untuk membuka atau menutup kamera.
 */
const handleToggleCamera = () => {
  if (isCameraRunning.value) {
    closeAllStreams();
  } else {
    if (!selectedCamera.value) {
      alert("No camera selected.");
      return;
    }
    isCameraRunning.value = true;
    if (selectedCamera.value.startsWith('wss://')) {
      openIpCameraStream();
    } else {
      openWebcamStream();
    }
  }
};

// --- Event Handlers untuk Aksi Lain ---

const handleAddModel = (event) => {
  const file = event.target.files[0];
  if (file) {
    const fileName = file.name.replace(".onnx", "");
    const newModel = { name: fileName, url: URL.createObjectURL(file) };
    customModels.value.push(newModel);
    selectedModel.value = newModel.url;
  }
};

const handleOpenImage = (event) => {
  const file = event.target.files[0];
  if (file) {
    imgSrc.value = URL.createObjectURL(file);
    if (openImageInputRef.value) {
      openImageInputRef.value.value = null;
    }
  }
};

const onOpenImageClick = () => {
  if (imgSrc.value) {
    imgSrc.value = null;
    if (overlayRef.value) {
      const ctx = overlayRef.value.getContext("2d");
      ctx.clearRect(0, 0, overlayRef.value.width, overlayRef.value.height);
    }
    details.value = [];
    inferenceTime.value = 0;
  } else {
    openImageInputRef.value?.click();
  }
};

// --- Lifecycle & Watchers ---

onMounted(() => {
  loadModel();
  getCameras();
});

watch([selectedDevice, selectedModel], loadModel);
</script>

<template>
  <Head title="Camera Stream" />
  <div class="flex flex-col items-center min-h-screen bg-background text-foreground p-4 md:p-8 font-sans">
    <h1 class="mb-6 text-4xl font-bold tracking-tight">Yolo Object Detection</h1>

    <Card class="w-full max-w-4xl mb-2">
      <CardContent class="grid grid-cols-1 p-6 md:grid-cols-3 gap-6">
        <div class="flex flex-col gap-2">
          <Label for="device-selector">Backend</Label>
          <Select id="device-selector" v-model="selectedDevice">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select Backend" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="webgpu">WebGPU</SelectItem>
              <SelectItem value="wasm">Wasm (CPU)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="model-selector">Model</Label>
          <Select id="model-selector" v-model="selectedModel">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yolo11n_custom_helmet_dyc">yolo11n-43.6M</SelectItem>
              <SelectItem value="yolo11n-simplify-dynamic">yolo11n-2.6M</SelectItem>
              <SelectItem value="yolo11s-simplify-dynamic">yolo11s-9.4M</SelectItem>
              <SelectItem value="yolo11m-simplify-dynamic">yolo11m-20.1M</SelectItem>
              <SelectItem v-for="model in customModels" :key="model.url" :value="model.url">
                {{ model.name }} (Custom)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="camera-selector">Camera</Label>
          <Select id="camera-selector" v-model="selectedCamera" :disabled="cameras.length === 0">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select Camera" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="(camera, index) in cameras" :key="camera.deviceId" :value="camera.deviceId">
                {{ camera.label || `Camera ${index + 1}` }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>

    <div class="container bg-muted shadow relative w-full max-w-4xl aspect-video flex justify-center items-center rounded-lg overflow-hidden">
      <canvas ref="inputCanvasRef" hidden></canvas>

      <canvas ref="jsmpegCanvasRef" class="block w-full h-full object-contain" :class="{ hidden: !jsmpegPlayer }"></canvas>

      <video ref="cameraRef" @playing="startDetectionLoop(cameraRef)" class="block w-full h-full object-contain" :class="{ hidden: !cameraStream }" autoplay playsinline></video>

      <img ref="imgRef" :src="imgSrc" @load="handleImageLoad" class="block w-full h-full object-contain" :class="{ hidden: !imgSrc }" />

      <canvas ref="overlayRef" class="absolute pointer-events-none"></canvas>

      <div v-if="!imgSrc && !cameraStream && !jsmpegPlayer" class="text-muted-foreground">
        Buka Gambar atau Kamera untuk memulai
      </div>
    </div>

    <div class="container w-full max-w-4xl flex justify-between gap-4 my-3">
      <Button @click="onOpenImageClick" :disabled="isCameraRunning || !isModelLoaded" variant="outline">
        {{ openImageBtnText }}
      </Button>
      <input type="file" accept="image/*" hidden ref="openImageInputRef" @change="handleOpenImage" />

      <Button @click="handleToggleCamera" :disabled="cameras.length === 0 || !!imgSrc || !isModelLoaded">
        {{ openCameraBtnText }}
      </Button>

      <Button @click="addModelInputRef?.click()" variant="secondary">
        Add Custom Model
      </Button>
      <input type="file" accept=".onnx" hidden ref="addModelInputRef" @change="handleAddModel" />
    </div>

    <div class="text-center w-full max-w-4xl">
      <div class="flex justify-between text-sm md:text-base my-4">
        <p>
          Warm up time: <span class="font-semibold text-primary">{{ warnUpTime }}ms</span>
        </p>
        <p>
          Inference time:
          <span class="font-semibold text-primary">{{ inferenceTime }}ms</span>
        </p>
      </div>
      <p :class="[modelStatusColor, !isModelLoaded ? 'animate-pulse' : '']" class="text-lg font-medium">
        {{ modelStatusText }}
      </p>
    </div>

    <Card class="w-full max-w-4xl py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[100px] ps-6">#</TableHead>
            <TableHead>Class Name</TableHead>
            <TableHead class="text-right pe-6">Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="details.length === 0">
            <TableCell colspan="3" class="text-center h-24">No objects detected.</TableCell>
          </TableRow>
          <TableRow v-for="(item, index) in details" :key="index">
            <TableCell class="font-medium ps-6">{{ index + 1 }}</TableCell>
            <TableCell>{{ classes.class[item.class_idx] }}</TableCell>
            <TableCell class="text-right pe-6">{{ (item.score * 100).toFixed(1) }}%</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
