#!/bin/bash
# qa_sheet.sh <scratch> <video> <out.jpg> : one frame per second, 270x480, 8 per row, with timestamps
S=$1; V=$2; O=$3
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V"); N=$(python3 -c "import math;print(math.ceil($D))")
ffmpeg -nostdin -v error -y -i "$V" -vf "fps=1,scale=270:480,drawtext=fontfile=$S/assets/Fredoka.ttf:text='%{pts\:hms}':x=6:y=6:fontsize=22:fontcolor=yellow:borderw=2:bordercolor=black,tile=8x$(( (N+7)/8 )):padding=3" -frames:v 1 "$O"
