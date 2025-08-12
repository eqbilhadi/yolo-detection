<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CameraStreamController extends Controller
{
    public function index()
    {
        return Inertia::render('yolo/camera-stream/Index');
        // return Inertia::render('yolo/camera-stream/Test');
    }
}
