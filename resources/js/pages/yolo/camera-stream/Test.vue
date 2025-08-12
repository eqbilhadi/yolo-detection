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
const allCameras = ref([]);
const warnUpTime = ref(0);
const modelStatusText = ref("Model not loaded");
const isModelLoaded = ref(false);

// Mengelola state untuk dua kamera
const cameraInstances = ref([
  { id: 1, selectedCameraId: null, stream: null, isRunning: false, animationFrameId: null, details: [], inferenceTime: 0, sessionsConfig: null },
  { id: 2, selectedCameraId: null, stream: null, isRunning: false, animationFrameId: null, details: [], inferenceTime: 0, sessionsConfig: null }
]);

const cameraRefs = ref([]);
const overlayRefs = ref([]);
const inputCanvasRefs = ref([]);

const addModelInputRef = ref(null);

// --- Computed Properties ---
const isAnyCameraRunning = computed(() => cameraInstances.value.some(cam => cam.isRunning));

// --- Logika Inti ---
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
    
    for (const instance of cameraInstances.value) {
        const { yolo_model, nms } = await model_loader.model_loader(device, model_path, nms_path, config);
        instance.sessionsConfig = { yolo_model, nms, ...config };
    }
    const end = performance.now();
    
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
    allCameras.value = videoDevices;
    if (videoDevices.length > 0) {
      cameraInstances.value[0].selectedCameraId = videoDevices[0].deviceId;
    }
    if (videoDevices.length > 1) {
      cameraInstances.value[1].selectedCameraId = videoDevices[1].deviceId;
    } else if (videoDevices.length > 0) {
      cameraInstances.value[1].selectedCameraId = videoDevices[0].deviceId;
    }
  } catch (error) {
    console.error("Error enumerating devices:", error);
  }
};

const handleFrameContinuous = async (instance, index) => {
  if (!instance.isRunning || !instance.sessionsConfig) return;

  const cameraEl = cameraRefs.value[index];
  const canvasEl = inputCanvasRefs.value[index];
  const overlayEl = overlayRefs.value[index];

  if (!cameraEl || !canvasEl || !overlayEl) return;

  const ctx = canvasEl.getContext("2d");
  ctx.drawImage(cameraEl, 0, 0, cameraEl.videoWidth, cameraEl.videoHeight);
  
  const [results, results_inferenceTime] = await inference_pipeline(canvasEl, instance.sessionsConfig);

  if (!instance.isRunning) return;

  instance.details = results;
  instance.inferenceTime = results_inferenceTime;
  draw_bounding_boxes(results, overlayEl);

  instance.animationFrameId = requestAnimationFrame(() => handleFrameContinuous(instance, index));
};

const handleCameraLoad = (instance, index) => {
  const cameraEl = cameraRefs.value[index];
  if (!cameraEl) return;

  const inputCanvasEl = inputCanvasRefs.value[index];
  const overlayEl = overlayRefs.value[index];

  const inputCanvasCtx = inputCanvasEl.getContext("2d", { willReadFrequently: true });
  inputCanvasCtx.canvas.width = cameraEl.videoWidth;
  inputCanvasCtx.canvas.height = cameraEl.videoHeight;
  overlayEl.width = cameraEl.videoWidth;
  overlayEl.height = cameraEl.videoHeight;
  
  if (instance.isRunning) {
    handleFrameContinuous(instance, index);
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

const handleToggleAllCameras = async () => {
  if (isAnyCameraRunning.value) {
    cameraInstances.value.forEach((instance, index) => {
      instance.isRunning = false;
      if (instance.animationFrameId) {
        cancelAnimationFrame(instance.animationFrameId);
        instance.animationFrameId = null;
      }
      if (instance.stream) {
        instance.stream.getTracks().forEach(track => track.stop());
      }
      instance.stream = null;
      const cameraEl = cameraRefs.value[index];
      if (cameraEl) cameraEl.srcObject = null;
      
      instance.details = [];
      instance.inferenceTime = 0;
    });

    nextTick(() => {
      overlayRefs.value.forEach(overlayEl => {
        if (overlayEl) {
          const ctx = overlayEl.getContext("2d");
          ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
        }
      });
    });

  } else {
    // Start semua kamera
    for (const [index, instance] of cameraInstances.value.entries()) {
      if (!instance.selectedCameraId) {
        alert(`Please select a camera for Camera ${instance.id}.`);
        continue;
      }
      try {
        instance.isRunning = true;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: instance.selectedCameraId },
          audio: false,
        });
        instance.stream = stream;
        const cameraEl = cameraRefs.value[index];
        if (cameraEl) cameraEl.srcObject = stream;
      } catch (error) {
        instance.isRunning = false;
        console.error(`Error accessing camera ${instance.id}:`, error);
        alert(`Could not access Camera ${instance.id}. Please check permissions.`);
      }
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
  <div class="flex flex-col items-center min-h-screen bg-background text-foreground p-4 md:p-8 font-sans">
    <h1 class="my-6 text-4xl font-bold tracking-tight">Yolo Dual Camera Detection</h1>

    <!-- Pengaturan Model -->
    <Card class="w-full max-w-6xl mb-4">
      <CardContent class="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="flex flex-col gap-2">
          <Label for="device-selector">Backend</Label>
          <Select id="device-selector" v-model="selectedDevice">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="webgpu">WebGPU</SelectItem>
              <SelectItem value="wasm">Wasm (CPU)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="model-selector">Model</Label>
          <Select id="model-selector" v-model="selectedModel">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yolo11n-simplify-dynamic">yolo11n-2.6M</SelectItem>
              <SelectItem v-for="model in customModels" :key="model.url" :value="model.url">{{ model.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <!-- Pengaturan untuk setiap kamera -->
        <div v-for="instance in cameraInstances" :key="instance.id" class="flex flex-col gap-2">
          <Label :for="`camera-selector-${instance.id}`">Camera {{ instance.id }}</Label>
          <Select :id="`camera-selector-${instance.id}`" v-model="instance.selectedCameraId" :disabled="allCameras.length === 0">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="(camera, index) in allCameras" :key="camera.deviceId" :value="camera.deviceId">
                {{ camera.label || `Camera ${index + 1}` }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>

    <div class="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div v-for="(instance, index) in cameraInstances" :key="instance.id" class="flex flex-col gap-2">
        <h2 class="text-center font-semibold">Camera {{ instance.id }}</h2>
        <div class="container bg-muted shadow relative w-full aspect-video flex justify-center items-center rounded-lg overflow-hidden">
          <canvas :ref="el => inputCanvasRefs[index] = el" hidden></canvas>
          <video
            :ref="el => cameraRefs[index] = el"
            @loadeddata="handleCameraLoad(instance, index)"
            class="block w-full h-full object-contain"
            :class="{ hidden: !instance.stream }"
            autoplay
            playsinline
          ></video>
          <canvas
            :ref="el => overlayRefs[index] = el"
            class="absolute pointer-events-none"
          ></canvas>
          <div v-if="!instance.stream" class="text-muted-foreground">
            Camera {{ instance.id }} Off
          </div>
        </div>
        <p class="text-center text-sm">
          Inference time: <span class="font-semibold text-primary">{{ instance.inferenceTime }}ms</span>
        </p>
      </div>
    </div>

    <!-- Tombol Kontrol Utama -->
    <div class="container w-full max-w-6xl flex justify-center gap-4 my-6">
      <Button @click="handleToggleAllCameras" :disabled="allCameras.length === 0 || !isModelLoaded">
        {{ isAnyCameraRunning ? "Close All Cameras" : "Open All Cameras" }}
      </Button>
      <Button @click="addModelInputRef?.click()" variant="secondary">
        Add Custom Model
      </Button>
      <input type="file" accept=".onnx" hidden ref="addModelInputRef" @change="handleAddModel"/>
    </div>

    <!-- Status Model -->
    <div class="text-center w-full max-w-4xl">
      <p :class="[isModelLoaded ? 'text-green-500' : 'text-red-500', !isModelLoaded ? 'animate-pulse' : '']" class="text-lg font-medium">
        {{ modelStatusText }}
      </p>
    </div>

    <!-- Tabel Hasil Deteksi Gabungan -->
    <Card class="w-full max-w-6xl mt-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[100px] ps-6">Camera</TableHead>
            <TableHead>Class Name</TableHead>
            <TableHead class="text-right pe-6">Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-for="instance in cameraInstances" :key="`details-${instance.id}`">
            <TableRow v-if="instance.details.length === 0 && instance.isRunning">
              <TableCell class="font-medium ps-6">{{ instance.id }}</TableCell>
              <TableCell colspan="2" class="text-center">Detecting...</TableCell>
            </TableRow>
            <TableRow v-for="(item, index) in instance.details" :key="index">
              <TableCell class="font-medium ps-6">{{ instance.id }}</TableCell>
              <TableCell>{{ classes.class[item.class_idx] }}</TableCell>
              <TableCell class="text-right pe-6">{{ (item.score * 100).toFixed(1) }}%</TableCell>
            </TableRow>
          </template>
           <TableRow v-if="!isAnyCameraRunning">
              <TableCell colspan="3" class="text-center h-24">All cameras are off.</TableCell>
            </TableRow>
        </TableBody>
      </Table>
    </Card>

  </div>
</template>
