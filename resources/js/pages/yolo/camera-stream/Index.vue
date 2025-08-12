<script setup>
import { ref, onMounted, watch, computed, nextTick } from "vue";
import * as ort from "onnxruntime-web/webgpu";

// Import komponen shadcn-vue
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// Import utility yolo detection
import * as model_loader from "@/utils/model_loader";
import { inference_pipeline } from "@/utils/inference_pipeline";
import { draw_bounding_boxes } from "@/utils/draw_bounding_boxes";
import classes from "@/utils/yolo_classes.json";

// --- Konfigurasi Model ---
const input_shape = [1, 3, 640, 640];
const topk = 100;
const iou_threshold = 0.45;
const score_threshold = 0.45;

const config = {
  input_shape: input_shape,
  tensor_topk: new ort.Tensor("int32", new Int32Array([topk])),
  tensor_iou_threshold: new ort.Tensor("float32", new Float32Array([iou_threshold])),
  tensor_score_threshold: new ort.Tensor("float32", new Float32Array([score_threshold])),
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

// ref untuk elemen DOM
const overlayRef = ref(null);
const cameraRef = ref(null);
const imgRef = ref(null);
const inputCanvasRef = ref(null);
const openImageInputRef = ref(null);
const addModelInputRef = ref(null);
const animationFrameId = ref(null);
const isCameraRunning = ref(false);

// --- Computed Properties untuk UI dinamis ---
const openImageBtnText = computed(() => (imgSrc.value ? "Close Image" : "Open Image"));
const openCameraBtnText = computed(() =>
  cameraStream.value ? "Close Camera" : "Open Camera"
);
const modelStatusColor = computed(() =>
  isModelLoaded.value ? "text-green-500" : "text-red-500"
);

// --- Logika Inti (Core Logic) ---
const loadModel = async () => {
  modelStatusText.value = "Loading model...";
  isModelLoaded.value = false;
  const device = selectedDevice.value;
  const modelUrl = selectedModel.value;
  const isCustom = customModels.value.some((m) => m.url === modelUrl);
  const model_path = isCustom ? modelUrl : `${window.location.origin}/models/${modelUrl}.onnx`;
  const nms_path = `${window.location.origin}/yolo-decoder.onnx`;
  try {
    const start = performance.now();
    const { yolo_model, nms } = await model_loader.model_loader(device, model_path, nms_path, config);
    const end = performance.now();
    sessionsConfig.value = { yolo_model, nms, ...config };
    modelStatusText.value = "Model loaded";
    isModelLoaded.value = true;
    warnUpTime.value = (end - start).toFixed(2);
  } catch (error) {
    modelStatusText.value = "Model loading failed";
    console.error(error);
  }
};

const getCameras = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    cameras.value = videoDevices;
    if (videoDevices.length > 0) {
      selectedCamera.value = videoDevices[0].deviceId;
    }
  } catch (error) {
    console.error("Error enumerating devices:", error);
  }
};

const handleImageLoad = async () => {
  if (!imgRef.value || !sessionsConfig.value) return;
  overlayRef.value.width = imgRef.value.width;
  overlayRef.value.height = imgRef.value.height;
  const [results, results_inferenceTime] = await inference_pipeline(imgRef.value, sessionsConfig.value);
  details.value = results;
  inferenceTime.value = results_inferenceTime;
  draw_bounding_boxes(results, overlayRef.value);
};

const handleFrameContinuous = async (ctx) => {
  if (!isCameraRunning.value) return;

  ctx.drawImage(cameraRef.value, 0, 0, cameraRef.value.videoWidth, cameraRef.value.videoHeight);
  const [results, results_inferenceTime] = await inference_pipeline(inputCanvasRef.value, sessionsConfig.value);

  if (!isCameraRunning.value) return;

  details.value = results;
  inferenceTime.value = results_inferenceTime;
  draw_bounding_boxes(results, overlayRef.value);

  animationFrameId.value = requestAnimationFrame(() => handleFrameContinuous(ctx));
};

const handleCameraLoad = () => {
  if (!cameraRef.value) return;
  const inputCanvasCtx = inputCanvasRef.value.getContext("2d", { willReadFrequently: true });
  inputCanvasCtx.canvas.width = cameraRef.value.videoWidth;
  inputCanvasCtx.canvas.height = cameraRef.value.videoHeight;
  overlayRef.value.width = cameraRef.value.videoWidth;
  overlayRef.value.height = cameraRef.value.videoHeight;
  
  if (isCameraRunning.value) {
    handleFrameContinuous(inputCanvasCtx);
  }
};

// --- Event Handlers ---
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

const handleToggleCamera = async () => {
  if (cameraStream.value) {
    isCameraRunning.value = false;

    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value);
      animationFrameId.value = null;
    }

    if (cameraStream.value) {
        cameraStream.value.getTracks().forEach((track) => track.stop());
    }
    
    cameraStream.value = null;
    if (cameraRef.value) cameraRef.value.srcObject = null;
    
    details.value = [];
    inferenceTime.value = 0;

    nextTick(() => {
        if (overlayRef.value) {
            const ctx = overlayRef.value.getContext("2d");
            ctx.clearRect(0, 0, overlayRef.value.width, overlayRef.value.height);
        }
    });
    
  } else {
    if (!selectedCamera.value) {
      alert("No camera selected.");
      return;
    }
    try {
      isCameraRunning.value = true;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: selectedCamera.value },
        audio: false,
      });
      cameraStream.value = stream;
      if (cameraRef.value) cameraRef.value.srcObject = stream;
    } catch (error) {
      isCameraRunning.value = false;
      console.error("Error accessing camera:", error);
      alert("Could not access the camera. Please check permissions.");
    }
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
  <div
    class="flex flex-col items-center min-h-screen bg-background text-foreground p-4 md:p-8 font-sans"
  >
    <h1 class="mb-6 text-4xl font-bold tracking-tight">Yolo Object Detection</h1>

    <Card class="w-full max-w-4xl mb-2">
      <CardContent class="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <SelectItem
                v-for="model in customModels"
                :key="model.url"
                :value="model.url"
              >
                {{ model.name }} (Custom)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="camera-selector">Camera</Label>
          <Select
            id="camera-selector"
            v-model="selectedCamera"
            :disabled="cameras.length === 0"
          >
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select Camera" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="(camera, index) in cameras"
                :key="camera.deviceId"
                :value="camera.deviceId"
              >
                {{ camera.label || `Camera ${index + 1}` }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>

    <div
      class="container bg-muted shadow relative w-full max-w-4xl aspect-video flex justify-center items-center rounded-lg overflow-hidden"
    >
      <canvas ref="inputCanvasRef" hidden></canvas>
      <video
        ref="cameraRef"
        @loadeddata="handleCameraLoad"
        class="block w-full h-full object-contain"
        :class="{ hidden: !cameraStream }"
        autoplay
        playsinline
      ></video>
      <img
        ref="imgRef"
        :src="imgSrc"
        @load="handleImageLoad"
        class="block w-full h-full object-contain"
        :class="{ hidden: !imgSrc }"
      />
      <canvas
        ref="overlayRef"
        class="absolute pointer-events-none"
      ></canvas>
      <div v-if="!imgSrc && !cameraStream" class="text-muted-foreground">
        Buka Gambar atau Kamera untuk memulai
      </div>
    </div>

    <div class="container w-full max-w-4xl flex justify-between gap-4 my-3">
      <Button
        @click="onOpenImageClick"
        :disabled="!!cameraStream || !isModelLoaded"
        variant="outline"
      >
        {{ openImageBtnText }}
      </Button>
      <input
        type="file"
        accept="image/*"
        hidden
        ref="openImageInputRef"
        @change="handleOpenImage"
      />

      <Button
        @click="handleToggleCamera"
        :disabled="cameras.length === 0 || !!imgSrc || !isModelLoaded"
      >
        {{ openCameraBtnText }}
      </Button>

      <Button @click="addModelInputRef?.click()" variant="secondary">
        Add Custom Model
      </Button>
      <input
        type="file"
        accept=".onnx"
        hidden
        ref="addModelInputRef"
        @change="handleAddModel"
      />
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
      <p
        :class="[modelStatusColor, !isModelLoaded ? 'animate-pulse' : '']"
        class="text-lg font-medium"
      >
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
            <TableCell colspan="3" class="text-center h-24"
              >No objects detected.</TableCell
            >
          </TableRow>
          <TableRow v-for="(item, index) in details" :key="index">
            <TableCell class="font-medium ps-6">{{ index + 1 }}</TableCell>
            <TableCell>{{ classes.class[item.class_idx] }}</TableCell>
            <TableCell class="text-right pe-6"
              >{{ (item.score * 100).toFixed(1) }}%</TableCell
            >
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
