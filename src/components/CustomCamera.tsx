import React, { useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, Image, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput, getAllCameraDevices } from 'react-native-vision-camera';
import type { CameraRef, CameraDevice, PhotoFile } from 'react-native-vision-camera';
import { Ionicons } from '@expo/vector-icons';

type LocalPhoto = {
  id: string;
  uri: string;
  location: { latitude: number; longitude: number } | null;
};

type Props = {
  onCapture: (uri: string) => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete?: (photoId: string) => void;
  photos: LocalPhoto[];
  maxPhotos: number;
  enablePreview?: boolean;
};

const ZOOM_PRESET_LABELS = [0.5, 1, 2, 4, 6, 8];
const isAndroid = Platform.OS === 'android';

export function CustomCamera({ onCapture, onComplete, onCancel, photos, maxPhotos, enablePreview = true }: Props) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<CameraRef>(null);
  const photoOutput = usePhotoOutput({
    qualityPrioritization: 'quality',
    quality: 1.0,
  });

  // 主相機裝置
  const mainDevice = useCameraDevice('back', {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });

  // Android ultra-wide workaround: find standalone ultra-wide device if main device doesn't include it
  const ultraWideDevice = useMemo<CameraDevice | undefined>(() => {
    if (!isAndroid) return undefined;
    if (mainDevice?.physicalDevices.some((pd) => pd.type === 'ultra-wide-angle')) return undefined;
    const devices = getAllCameraDevices();
    return devices.find(
      (d) => d.position === 'back' && d.type === 'ultra-wide-angle',
    );
  }, [mainDevice]);

  const [useUltraWide, setUseUltraWide] = useState(false);
  const activeDevice = useUltraWide && ultraWideDevice ? ultraWideDevice : mainDevice;

  // Zoom presets clamped to device range
  const clampedPresets = useMemo(() => {
    if (!activeDevice) return ZOOM_PRESET_LABELS;
    return ZOOM_PRESET_LABELS.map((p) =>
      Math.min(Math.max(p, activeDevice.minZoom), activeDevice.maxZoom),
    );
  }, [activeDevice]);

  // 去重後的縮放 preset（合併主裝置與超廣角裝置的有效範圍，避免 0.5x/1x 重疊）
  const distinctPresets = useMemo(() => {
    const effMinZoom = Math.min(
      activeDevice?.minZoom ?? 1,
      isAndroid && ultraWideDevice ? ultraWideDevice.minZoom : 99,
    );
    const effMaxZoom = Math.max(
      activeDevice?.maxZoom ?? 1,
      isAndroid && ultraWideDevice ? ultraWideDevice.maxZoom : 0,
    );
    const seen: { clamped: number; label: number }[] = [];
    for (const label of ZOOM_PRESET_LABELS) {
      const clamped = Math.min(Math.max(label, effMinZoom), effMaxZoom);
      const dupIdx = seen.findIndex((s) => Math.abs(s.clamped - clamped) < 0.08);
      if (dupIdx === -1) {
        seen.push({ clamped, label });
      } else if (Math.abs(label - clamped) < Math.abs(seen[dupIdx].label - seen[dupIdx].clamped)) {
        seen[dupIdx] = { clamped, label };
      }
    }
    return seen.map((s) => s.label);
  }, [activeDevice, ultraWideDevice]);

  const handleZoomPreset = useCallback(
    (preset: number) => {
      if (!activeDevice) return;
      const clamped = Math.min(Math.max(preset, activeDevice.minZoom), activeDevice.maxZoom);
      setZoom(clamped);
      // Switch to ultra-wide device when 0.5x selected on Android
      if (isAndroid && ultraWideDevice) {
        setUseUltraWide(preset < 1);
      }
    },
    [activeDevice, ultraWideDevice],
  );

  const isPresetActive = useCallback(
    (preset: number) => {
      if (!activeDevice) return false;
      const effective = Math.min(Math.max(preset, activeDevice.minZoom), activeDevice.maxZoom);
      return Math.abs(zoom - effective) < 0.05;
    },
    [zoom, activeDevice],
  );

  const canAddMore = photos.length < maxPhotos;
  const isSinglePhotoMode = enablePreview;
  const isActive = previewUri === null;

  // 權限請求
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>需要相機權限才能拍照</Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>授予權限</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // 裝置載入中
  if (!activeDevice) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const takePicture = async () => {
    if (canAddMore && !isCapturing) {
      try {
        setIsCapturing(true);
        const photoFile: PhotoFile = await photoOutput.capturePhotoToFile(
          { flashMode: 'off' },
          {},
        );
        if (photoFile?.filePath) {
          const fileUri = `file://${photoFile.filePath}`;
          if (isSinglePhotoMode) {
            setPreviewUri(fileUri);
          } else {
            onCapture(fileUri);
          }
        }
      } catch (error) {
        console.error('拍照錯誤:', error);
      } finally {
        setIsCapturing(false);
      }
    }
  };

  const handleConfirm = () => {
    if (previewUri) {
      onCapture(previewUri);
      setPreviewUri(null);
      onComplete();
    }
  };

  const handleRetake = () => {
    setPreviewUri(null);
  };

  const handleCancel = () => {
    setPreviewUri(null);
    onCancel();
  };

  // 預覽模式
  if (isSinglePhotoMode && previewUri) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <Image source={{ uri: previewUri }} style={styles.previewImage} />
        <View style={styles.actionBar}>
          <Pressable style={styles.actionButtonCancel} onPress={handleCancel}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>取消</Text>
          </Pressable>
          <Pressable style={styles.actionButtonLeft} onPress={handleRetake}>
            <Ionicons name="refresh" size={32} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>重新拍</Text>
          </Pressable>
          <Pressable style={styles.actionButtonRight} onPress={handleConfirm}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>確定</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 拍攝模式
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* 相機預覽 - 保持3:4比例顯示完整傳感器視野 */}
      <View style={styles.cameraWrapper}>
        <Camera
          ref={cameraRef}
          style={styles.camera}
          device={activeDevice}
          isActive={isActive}
          outputs={[photoOutput]}
          zoom={zoom}
        />
      </View>

      {/* 頂部控制欄 */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <Pressable style={styles.topButton} onPress={onCancel}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
      </SafeAreaView>

      {/* 正在載入照片提示 */}
      {isCapturing && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <Ionicons name="hourglass" size={48} color="#FFFFFF" />
            <ActivityIndicator size="large" color="#FFFFFF" style={styles.loadingSpinner} />
            <Text style={styles.loadingText}>正在載入照片...</Text>
          </View>
        </View>
      )}

      {/* 底部控制欄 */}
      <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
        <View style={styles.bottomControls}>
          {/* 縮放控制 */}
          <View style={styles.zoomControls}>
            {distinctPresets.map((preset) => (
              <Pressable
                key={preset}
                style={[
                  styles.zoomPresetButton,
                  isPresetActive(preset) && styles.zoomPresetButtonActive,
                ]}
                onPress={() => handleZoomPreset(preset)}
              >
                <Text
                  style={[
                    styles.zoomPresetText,
                    isPresetActive(preset) && styles.zoomPresetTextActive,
                  ]}
                >
                  {preset}x
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 拍照按鈕 */}
          <Pressable
            style={[styles.captureButton, (!canAddMore || isCapturing) && styles.captureButtonDisabled]}
            onPress={takePicture}
            disabled={!canAddMore || isCapturing}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>
        </View>

        <Text style={styles.hintText}>
          {isSinglePhotoMode ? '請拍攝一張相片' : `${photos.length}/${maxPhotos} 張相片`}
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraWrapper: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    bottom: 170,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  camera: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: '100%',
  },

  // 權限請求
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 頂部控制欄
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    zIndex: 100,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 底部控制欄
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 100,
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingVertical: 20,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
    gap: 4,
  },
  zoomPresetButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 28,
  },
  zoomPresetButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  zoomPresetText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomPresetTextActive: {
    color: '#000000',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },

  // 載入中
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  loadingSpinner: {
    marginTop: -8,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  // 預覽模式
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  actionBar: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 999,
  },
  actionButtonCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    gap: 4,
  },
  actionButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
  },
  actionButtonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    marginBottom: 12,
  },
});
