const resolveWsUrl = (baseUrl?: string, path = '/ws') => {
  const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  const rawBase = (baseUrl || envBase || 'http://localhost:8000').replace(/\/$/, '');
  const wsBase = rawBase.startsWith('ws') ? rawBase : rawBase.replace(/^http/, 'ws');
  return `${wsBase}${path}`;
};

export type AudioSenderOptions = {
  baseUrl?: string;
  roomId: string;
  outputSampleRate?: number;
  processing?: AudioProcessingOptions;
};

export type AudioProcessingOptions = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  highPassFilter: boolean;
  noiseGateThreshold: number;
  gain: number;
};

const DEFAULT_PROCESSING: AudioProcessingOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  highPassFilter: true,
  noiseGateThreshold: 0.015,
  gain: 1,
};

export class AudioSender {
  private options: AudioSenderOptions;
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isStarting = false;

  constructor(options: AudioSenderOptions) {
    this.options = options;
  }

  start() {
    if (this.ws || this.isStarting) return;
    this.isStarting = true;
    void this.initialize();
  }

  stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.filter) {
      this.filter.disconnect();
      this.filter = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.isStarting = false;
  }

  private cleanup() {
    this.stop();
    this.ws = null;
  }

  private async initialize() {
    try {
      const url = resolveWsUrl(
        this.options.baseUrl,
        `/ws/rooms/${this.options.roomId}/audio`
      );
      const ws = new WebSocket(url);
      this.ws = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('audio_ws_error'));
      });

      const processing = this.normalizeProcessing(this.options.processing);
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: processing.echoCancellation,
          noiseSuppression: processing.noiseSuppression,
          autoGainControl: processing.autoGainControl
        }
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const inputRate = this.audioContext.sampleRate;
      const outputRate = this.options.outputSampleRate ?? 16000;

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      let pipeline: AudioNode = this.source;
      if (processing.highPassFilter) {
        this.filter = this.audioContext.createBiquadFilter();
        this.filter.type = 'highpass';
        this.filter.frequency.value = 120;
        this.filter.Q.value = 0.707;
        pipeline.connect(this.filter);
        pipeline = this.filter;
      }
      if (processing.gain !== 1) {
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = Math.min(2, Math.max(0.5, processing.gain));
        pipeline.connect(this.gainNode);
        pipeline = this.gainNode;
      }
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (event) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        let gateClosed = false;
        if (processing.noiseGateThreshold > 0) {
          const rms = calculateRms(input);
          gateClosed = rms < processing.noiseGateThreshold;
        }
        const downsampled =
          outputRate === inputRate
            ? input
            : downsampleBuffer(input, inputRate, outputRate);
        const gated = gateClosed ? zeroBuffer(downsampled.length) : downsampled;
        const pcm = floatTo16BitPCM(gated);
        this.ws.send(pcm);
        const output = event.outputBuffer.getChannelData(0);
        output.fill(0);
      };

      pipeline.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error(error);
      this.cleanup();
    } finally {
      this.isStarting = false;
    }
  }

  private normalizeProcessing(
    processing?: AudioProcessingOptions
  ): AudioProcessingOptions {
    if (!processing) return DEFAULT_PROCESSING;
    return {
      echoCancellation: processing.echoCancellation ?? DEFAULT_PROCESSING.echoCancellation,
      noiseSuppression: processing.noiseSuppression ?? DEFAULT_PROCESSING.noiseSuppression,
      autoGainControl: processing.autoGainControl ?? DEFAULT_PROCESSING.autoGainControl,
      highPassFilter: processing.highPassFilter ?? DEFAULT_PROCESSING.highPassFilter,
      noiseGateThreshold:
        processing.noiseGateThreshold ?? DEFAULT_PROCESSING.noiseGateThreshold,
      gain: processing.gain ?? DEFAULT_PROCESSING.gain
    };
  }
}

const downsampleBuffer = (buffer: Float32Array, inRate: number, outRate: number) => {
  const ratio = inRate / outRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offset = 0;
  for (let i = 0; i < newLength; i++) {
    const nextOffset = Math.round((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = offset; j < nextOffset && j < buffer.length; j++) {
      sum += buffer[j];
      count += 1;
    }
    result[i] = count ? sum / count : 0;
    offset = nextOffset;
  }
  return result;
};

const floatTo16BitPCM = (input: Float32Array) => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
};

const calculateRms = (input: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += input[i] * input[i];
  }
  return Math.sqrt(sum / input.length);
};

const zeroBuffer = (length: number) => new Float32Array(length);
