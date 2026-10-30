import { focusRing } from '@gofor/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { captureVideoFrame, type LoadedPhoto, openCamera } from './capture.ts';

export interface CameraCaptureProps {
  /** 抓到一帧后交给调用方。父组件通常会关闭覆盖层，卸载时这里负责关摄像头。 */
  onCaptured: (photo: LoadedPhoto) => void;
  onCancel: () => void;
}

type CameraStatus = 'opening' | 'live' | 'error';

/** 把 getUserMedia 的失败名翻译成用户能照着做的中文。 */
function cameraErrorMessage(cause: unknown): string {
  if (typeof DOMException !== 'undefined' && cause instanceof DOMException) {
    switch (cause.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '摄像头权限被拒绝了。可以在浏览器地址栏重新允许，或直接改用「选一张照片」。';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return '没有找到摄像头。改用「选一张照片」也能扫描。';
      case 'NotReadableError':
      case 'TrackStartError':
        return '摄像头被别的程序占用了。关掉它再试，或者改用「选一张照片」。';
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return '这个摄像头不支持请求的画面尺寸。改用「选一张照片」也能扫描。';
      default:
        break;
    }
  }
  return cause instanceof Error && cause.message !== ''
    ? `打不开摄像头：${cause.message}`
    : '打不开摄像头，请改用「选一张照片」。';
}

/**
 * 实时取景（P2-2.2 的「拍一张」路径）。
 *
 * 只在挂载时请求一次摄像头——也就是说，**只有用户点了「用相机拍」才会弹权限**，
 * 页面加载不碰 `getUserMedia`（e2e/桌面浏览器常常没有摄像头）。
 * 失败一律退回「选一张照片」，不把用户卡在一个黑屏里。
 *
 * 摄像头属于隐私资源：取消、拍下、切页、Esc 任何一条路都会 stop 全部 track。
 */
export function CameraCapture({ onCaptured, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('opening');
  const [message, setMessage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream !== null) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (videoRef.current !== null) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // 取消时先释放摄像头再交给父组件：不能指望卸载时机刚好，隐私资源要当场放掉。
  const cancel = useCallback(() => {
    stopStream();
    onCancel();
  }, [onCancel, stopStream]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stream = await openCamera();
        // 权限对话框可能开着很久：这期间用户已经取消/切页了，拿到流要立刻关掉。
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video === null) {
          stopStream();
          return;
        }
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // 自动播放可能被拦：muted + playsInline 通常能过；失败的兜底在「取消」上。
        }
        if (!cancelled) setStatus('live');
      } catch (cause) {
        if (cancelled) return;
        setStatus('error');
        setMessage(cameraErrorMessage(cause));
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  // 手机上弹全屏覆盖层时，Esc 是最顺手的退出方式（不要求用户去找按钮）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cancel]);

  const onCapture = async () => {
    const video = videoRef.current;
    if (video === null || status !== 'live' || capturing) return;
    setCapturing(true);
    setMessage(null);
    try {
      const photo = await captureVideoFrame(video);
      // 先释放摄像头再进下一步：拖四角可能花很久，没必要一直占着。
      stopStream();
      onCaptured(photo);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '这一帧没有抓到画面，再试一次。');
      setCapturing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black/90 p-4 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="用相机拍一张纸"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body">用相机拍一张纸</p>
          <p className="mt-0.5 text-caption leading-relaxed opacity-60">
            把纸放平，四个角都进画面。拍下后还能拖四角微调。
          </p>
        </div>
        <button
          type="button"
          onClick={cancel}
          className={`shrink-0 rounded-md border border-white/25 px-3 py-1.5 text-small transition duration-fast ease-standard ${focusRing}`}
        >
          取消
        </button>
      </div>

      <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
          aria-label="摄像头实时画面"
        />

        {status === 'opening' ? (
          <p className="absolute inset-0 flex items-center justify-center text-small opacity-70">
            正在打开摄像头…
          </p>
        ) : null}

        {status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-body leading-relaxed" role="alert">
              {message ?? '打不开摄像头'}
            </p>
            <button
              type="button"
              onClick={cancel}
              className={`rounded-md bg-white px-4 py-2 text-small text-black ${focusRing}`}
            >
              返回，选一张照片
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        {message !== null && status !== 'error' ? (
          <p className="text-center text-caption text-warn" role="alert">
            {message}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void onCapture()}
          disabled={status !== 'live' || capturing}
          className={`rounded-full bg-white px-10 py-2.5 text-body text-black transition duration-fast ease-standard disabled:opacity-40 ${focusRing}`}
        >
          {capturing ? '正在抓这一帧…' : '拍下'}
        </button>
      </div>
    </div>
  );
}
