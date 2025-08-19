<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DataMatrix extends Model
{
    protected $table = 'data_matrixs';

    protected $fillable = [
        'classname',
        'confidence',
        'img',
    ];
}
