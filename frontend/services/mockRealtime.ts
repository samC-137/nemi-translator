import { Language, RoomStats, RoomStatus, StreamPacket } from '../types';

export type MockRealtimeConfig = {
  sourceLanguage: Language;
  targetLanguage: Language;
  onTranscription?: (packet: StreamPacket) => void;
  onTranslation?: (packet: StreamPacket) => void;
  onStatus?: (status: RoomStatus) => void;
  onStats?: (stats: RoomStats) => void;
  typingIntervalMs?: number;
  translationIntervalMs?: number;
  translationDelayMs?: number;
  statsIntervalMs?: number;
};

const EN_TEXT =
  'Chloe is the embodiment of maternal love in the face of utter chaos. She is a silent heroine whose sacrifice and determination allowed Yoki to survive, find her strength, and ultimately change the world. Her character is a mixture of deep sadness, unquenchable hope, and practical wisdom.';

const RU_TEXT =
  'Хлоя — воплощение материнской любви перед лицом полного хаоса. Она — молчаливая героиня, чья жертвенность и решимость позволили Йоки выжить, обрести силу и, в конечном итоге, изменить мир. Ее характер — смесь глубокой печали, неугасимой надежды и практической мудрости.';

const pickTextForLanguage = (language: Language, fallback: string) => {
  if (language.code.toLowerCase().startsWith('ru')) return RU_TEXT;
  if (language.code.toLowerCase().startsWith('en')) return EN_TEXT;
  return fallback;
};

const createPacketId = (index: number) => `pkt-${index}`;

export class MockRealtimeService {
  private config: MockRealtimeConfig | null = null;
  private status: RoomStatus = 'stopped';
  private transcriptionIndex = 0;
  private translationIndex = 0;
  private packetCounter = 0;
  private transcriptionDone = false;
  private translationDone = false;
  private transcriptionText = '';
  private translationText = '';
  private statusTimer: number | null = null;
  private transcriptionTimer: number | null = null;
  private translationStartTimer: number | null = null;
  private translationTimer: number | null = null;
  private statsTimer: number | null = null;

  start(config: MockRealtimeConfig) {
    this.stop();
    this.config = config;
    this.packetCounter = 0;
    this.transcriptionIndex = 0;
    this.translationIndex = 0;
    this.transcriptionDone = false;
    this.translationDone = false;

    this.transcriptionText = pickTextForLanguage(config.sourceLanguage, EN_TEXT);
    this.translationText = pickTextForLanguage(config.targetLanguage, RU_TEXT);

    this.setStatus('connecting');
    this.statusTimer = window.setTimeout(() => {
      this.setStatus('live');
      this.startTranscription();
      this.startTranslation();
      this.startStats();
    }, 600);
  }

  stop() {
    this.clearTimers();
    if (this.status !== 'stopped') {
      this.setStatus('stopped');
    }
    this.config = null;
  }

  private setStatus(status: RoomStatus) {
    this.status = status;
    this.config?.onStatus?.(status);
  }

  private startTranscription() {
    const intervalMs = this.config?.typingIntervalMs ?? 35;
    this.transcriptionTimer = window.setInterval(() => {
      if (!this.transcriptionText.length) {
        this.transcriptionDone = true;
        this.checkForCompletion();
        return;
      }

      this.transcriptionIndex = Math.min(
        this.transcriptionIndex + 1,
        this.transcriptionText.length
      );

      const packet: StreamPacket = {
        id: createPacketId(++this.packetCounter),
        text: this.transcriptionText.slice(0, this.transcriptionIndex),
        ts: Date.now()
      };
      this.config?.onTranscription?.(packet);

      if (this.transcriptionIndex >= this.transcriptionText.length) {
        this.transcriptionDone = true;
        if (this.transcriptionTimer) {
          window.clearInterval(this.transcriptionTimer);
          this.transcriptionTimer = null;
        }
        this.checkForCompletion();
      }
    }, intervalMs);
  }

  private startTranslation() {
    const delayMs = this.config?.translationDelayMs ?? 800;
    const intervalMs = this.config?.translationIntervalMs ?? 40;

    this.translationStartTimer = window.setTimeout(() => {
      this.translationTimer = window.setInterval(() => {
        if (!this.translationText.length) {
          this.translationDone = true;
          this.checkForCompletion();
          return;
        }

        this.translationIndex = Math.min(
          this.translationIndex + 1,
          this.translationText.length
        );

        const packet: StreamPacket = {
          id: createPacketId(++this.packetCounter),
          text: this.translationText.slice(0, this.translationIndex),
          ts: Date.now()
        };
        this.config?.onTranslation?.(packet);

        if (this.translationIndex >= this.translationText.length) {
          this.translationDone = true;
          if (this.translationTimer) {
            window.clearInterval(this.translationTimer);
            this.translationTimer = null;
          }
          this.checkForCompletion();
        }
      }, intervalMs);
    }, delayMs);
  }

  private startStats() {
    if (!this.config?.onStats) return;
    const intervalMs = this.config.statsIntervalMs ?? 2000;
    this.statsTimer = window.setInterval(() => {
      const stats: RoomStats = {
        latency: Math.floor(40 + Math.random() * 120),
        listenersCount: Math.floor(1 + Math.random() * 120)
      };
      this.config?.onStats?.(stats);
    }, intervalMs);
  }

  private checkForCompletion() {
    if (!this.transcriptionDone || !this.translationDone) return;
    this.clearTimers();
    if (this.status !== 'stopped') {
      this.setStatus('stopped');
    }
  }

  private clearTimers() {
    if (this.statusTimer) {
      window.clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.transcriptionTimer) {
      window.clearInterval(this.transcriptionTimer);
      this.transcriptionTimer = null;
    }
    if (this.translationStartTimer) {
      window.clearTimeout(this.translationStartTimer);
      this.translationStartTimer = null;
    }
    if (this.translationTimer) {
      window.clearInterval(this.translationTimer);
      this.translationTimer = null;
    }
    if (this.statsTimer) {
      window.clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }
}
