<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\DataMatrix;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CameraStreamController extends Controller
{
    public function index()
    {
        return Inertia::render('yolo/camera-stream/Rtsp');
        // return Inertia::render('yolo/camera-stream/Test');
    }

    public function store(Request $request)
    {
        // 1. Validasi data yang masuk
        $validatedData = $request->validate([
            'detections' => 'required|array',
            'detections.*.className' => 'required|string|max:255',
            'detections.*.confidence' => 'required|numeric',
            'detections.*.image' => 'image' // max 1MB per crop
        ]);

        // 2. Loop dan simpan setiap deteksi ke database
        foreach ($validatedData['detections'] as $detectionData) {
            $imageFile = $detectionData['image'];
            $imagePath = $imageFile->store('cropped_objects', 'public');

            DataMatrix::create([
                'classname' => $detectionData['className'],
                'confidence' => $detectionData['confidence'],
                'img' => $imagePath,
            ]);
        }

        return redirect()->back()->with('success', 'Deteksi berhasil disimpan!');
    }
}
