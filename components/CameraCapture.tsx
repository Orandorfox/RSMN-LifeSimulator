"use client";

/**
 * 极简摄像头组件
 * 直接拍照，无任何模型加载
 */

import React, { useCallback, useRef, useState } from "react";
import Image from "next/image";

/** 上传前最长边像素上限，减小 Base64 体积 */
const UPLOAD_MAX_EDGE_PX = 1280;
/** JPEG 质量 */
const UPLOAD_JPEG_QUALITY = 0.82;

export type CameraCapturePayload = {
  dataUrl: string;
  mimeType: string;
};

type Props = {
  onCapture: (payload: CameraCapturePayload) => void;
  locked?: boolean;
};

export function CameraCapture({ onCapture, locked = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);

  // 组件挂载时尝试打开摄像头
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('浏览器不支持摄像头功能');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    })
    .then(stream => {
      streamRef.current = stream;
      video.srcObject = stream;
      video.play().catch(e => console.error('播放失败:', e));
      setError(null);
    })
    .catch(e => {
      console.error('摄像头错误:', e);
      setError('无法访问摄像头，请在浏览器设置中允许使用摄像头');
    });

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      video.srcObject = null;
    };
  }, []);

  // 拍照功能
  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || locked) return;

    // 获取视频尺寸
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    // 计算缩放后的尺寸
    let scaledWidth = width;
    let scaledHeight = height;
    const maxEdge = Math.max(width, height);
    if (maxEdge > UPLOAD_MAX_EDGE_PX) {
      const scale = UPLOAD_MAX_EDGE_PX / maxEdge;
      scaledWidth = Math.round(width * scale);
      scaledHeight = Math.round(height * scale);
    }

    // 绘制到画布
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(scaledWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, scaledWidth, scaledHeight);

    // 转换为数据URL
    const dataUrl = canvas.toDataURL('image/jpeg', UPLOAD_JPEG_QUALITY);
    setImage(dataUrl);

    // 停止摄像头
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    video.srcObject = null;

    // 调用回调
    onCapture({ dataUrl, mimeType: 'image/jpeg' });
  }, [locked, onCapture]);

  const canTakePhoto = !image && !locked;

  return (
    <div className="w-full max-w-lg">
      <div className="relative aspect-[3/4] w-full bg-black rounded-2xl overflow-hidden">
        {/* 视频预览 */}
        {!image && (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
            autoPlay
            muted
            playsInline
          />
        )}
        
        {/* 拍照后的图片 */}
        {image && (
          <div className="w-full h-full relative">
            <Image 
              src={image} 
              alt="拍照结果" 
              fill 
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <p className="text-white text-center p-4">{error}</p>
          </div>
        )}

        {/* 画布（隐藏） */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* 拍照按钮 */}
      <button
        type="button"
        onClick={takePhoto}
        disabled={!canTakePhoto}
        className="w-full mt-4 bg-emerald-600 text-white py-3 rounded-xl font-semibold text-base cursor-pointer"
        style={{ touchAction: 'manipulation' }}
      >
        拍照
      </button>
    </div>
  );
}
