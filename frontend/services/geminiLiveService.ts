
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export class GeminiLiveService {
  private ai: any;
  private session: any;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;

  constructor() {
    // Initialization moved to startSession to ensure it always uses the latest API key
  }

  async startSession(config: {
    sourceLanguage: string;
    onTranscription: (text: string) => void;
    onTranslation?: (text: string) => void;
    onError: (e: any) => void;
  }) {
    // Correct initialization using named parameter and process.env.API_KEY directly
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.ai = ai;

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          const source = this.audioContext!.createMediaStreamSource(this.stream!);
          const scriptProcessor = this.audioContext!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            // CRITICAL: Solely rely on sessionPromise resolves and then call `session.sendRealtimeInput`
            sessionPromise.then((session: any) => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.audioContext!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.outputTranscription) {
            config.onTranscription(message.serverContent.outputTranscription.text);
          }
          // The Live API can also handle translation if requested via prompt
          if (message.serverContent?.modelTurn) {
             // If we had audio out, we'd handle it here
          }
        },
        onerror: config.onError,
        onclose: () => console.log('Session closed'),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: `You are a professional real-time translator. Translate the incoming audio from ${config.sourceLanguage} to the target language as accurately as possible. Output the transcription of what was said in the original language and its translation.`
      }
    });

    this.session = await sessionPromise;
  }

  stopSession() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    // Correctly close session if it exists
    if (this.session) {
      this.session.close();
    }
  }
}
