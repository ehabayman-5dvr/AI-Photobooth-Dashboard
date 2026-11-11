
export enum UserRole {
  ADMIN = 'ADMIN',
  REGULAR = 'REGULAR'
}

export type ProjectPlatformType = 'desktop' | 'web';

export type AutoRestartMode = 'disabled' | 'daily_time' | 'interval_hours' | 'both';

export interface ProjectOperatorSettings {
  // Security & Remote JSON Config
  operatorPassword?: string;
  remoteConfigUrl?: string;

  // AI & API
  openaiApiKey?: string;
  geminiApiKey?: string;
  openaiModel?: string;
  aiModelsList?: string[];
  imageQuality?: 'high' | 'medium' | 'low';
  previewMode?: boolean;

  // Cloudinary & Telemetry
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  cloudinaryFolder?: string;
  dashboardProjectId?: string;
  photoViewerUrl?: string;

  // Camera & Viewport
  selectedCameraId?: string;
  cameraRotation?: -90 | 0 | 90 | 180;
  cameraMirror?: boolean;

  // Printing & Compositing
  enablePrinting?: boolean;
  selectedPrinterName?: string;
  printerNames?: string[];
  printFillColor?: 'black' | 'white';
  printScaleDownPercent?: number;
  printTopPaddingPx?: number;
  printBottomPaddingPx?: number;
  printLeftPaddingPx?: number;
  printRightPaddingPx?: number;
  printCopies?: number;
  autoPrintOnResult?: boolean;
  singlePrintPerSession?: boolean;
  autoClearPrinterQueue?: boolean;
  compositeFrameAndLogos?: boolean;

  // Timers & UI
  countdownSeconds?: number;
  previewAutoProceedSeconds?: number;
  eraSelectionTimeoutSeconds?: number;
  resultIdleTimeoutSeconds?: number;
  soundEnabled?: boolean;

  // Kiosk & Self-Healing Memory Cleanup Schedule
  fullscreenOnTap?: boolean;
  kioskLocked?: boolean;
  autoRestartMode?: AutoRestartMode;
  autoRestartTime?: string;
  autoRestartIntervalHours?: number;

  // Custom Era Prompt Overrides
  customEraPrompts?: Record<string, string>;
}

export const DEFAULT_AI_MODELS = [
  'gpt-image-2.6-flare',
  'gpt-image-2.5-flare',
  'gpt-image-2',
  'gemini-nano-banana-2.1'
];

export interface ModelCostSetting {
  id: string;
  modelName: string;
  promptOnly: number;
  ref1: number;
  ref2: number;
  ref3: number;
}

export const DEFAULT_MODEL_COSTS: ModelCostSetting[] = [
  {
    id: 'gpt-image-2.6-flare',
    modelName: 'gpt-image-2.6-flare',
    promptOnly: 0.04,
    ref1: 0.06,
    ref2: 0.08,
    ref3: 0.10
  },
  {
    id: 'gpt-image-2.5-flare',
    modelName: 'gpt-image-2.5-flare',
    promptOnly: 0.035,
    ref1: 0.05,
    ref2: 0.065,
    ref3: 0.08
  },
  {
    id: 'gpt-image-2',
    modelName: 'gpt-image-2',
    promptOnly: 0.03,
    ref1: 0.045,
    ref2: 0.06,
    ref3: 0.075
  },
  {
    id: 'gemini-nano-banana-2.1',
    modelName: 'gemini-nano-banana-2.1',
    promptOnly: 0.02,
    ref1: 0.03,
    ref2: 0.04,
    ref3: 0.05
  }
];

export const DEFAULT_OPERATOR_SETTINGS: Required<ProjectOperatorSettings> = {
  operatorPassword: 'egy@26',
  remoteConfigUrl: '',
  openaiApiKey: '',
  geminiApiKey: '',
  openaiModel: 'gpt-image-2.6-flare',
  aiModelsList: [...DEFAULT_AI_MODELS],
  imageQuality: 'medium',
  previewMode: false,
  cloudinaryCloudName: '',
  cloudinaryApiKey: '',
  cloudinaryApiSecret: '',
  cloudinaryFolder: '',
  dashboardProjectId: '',
  photoViewerUrl: 'https://photobooth-viewer.vercel.app/',
  selectedCameraId: '',
  cameraRotation: -90,
  cameraMirror: true,
  enablePrinting: true,
  selectedPrinterName: '',
  printerNames: [],
  printFillColor: 'black',
  printScaleDownPercent: 0,
  printTopPaddingPx: 0,
  printBottomPaddingPx: 0,
  printLeftPaddingPx: 0,
  printRightPaddingPx: 0,
  printCopies: 5,
  autoPrintOnResult: false,
  singlePrintPerSession: true,
  autoClearPrinterQueue: false,
  compositeFrameAndLogos: true,
  countdownSeconds: 3,
  previewAutoProceedSeconds: 5,
  eraSelectionTimeoutSeconds: 120,
  resultIdleTimeoutSeconds: 60,
  soundEnabled: true,
  fullscreenOnTap: true,
  kioskLocked: true,
  autoRestartMode: 'daily_time',
  autoRestartTime: '07:00',
  autoRestartIntervalHours: 6,
  customEraPrompts: {
    tutankhamun: '',
    karnak: '',
    yuya_thoya: ''
  }
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  assignedProjectIds: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  ownerId: string;
  // Stats
  dailyLimit: number;
  currentGenerations: number;
  max_usage?: number; // Supabase map
  total_usage?: number; // Supabase map
  // Status
  status: 'active' | 'paused';
  is_active?: boolean; // Supabase map
  // Platform & AI & Printing
  projectType?: ProjectPlatformType;
  aiModelsList?: string[];
  selectedAiModel?: string;
  referenceImagesCount?: number;
  enablePrinting?: boolean;
  totalPrintedCopies?: number;
  // Cloudinary
  cloudinaryAccountId?: string | null;
  cloudinaryCloudName?: string;
  cloudinaryTag?: string;
  cloudinaryFolder?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  // Full Operator Settings
  operatorSettings?: ProjectOperatorSettings;
  // Supabase Snake Case Mappings
  project_type?: ProjectPlatformType;
  ai_models_list?: string[];
  selected_ai_model?: string;
  reference_images_count?: number;
  enable_printing?: boolean;
  total_printed_copies?: number;
  cloudinary_account_id?: string | null;
  cloudinary_tag?: string;
  cloudinary_folder?: string;
  operator_settings?: ProjectOperatorSettings;
  created_at?: string;
  created_by?: string;
}

export interface UsageLog {
  id: string;
  projectId: string;
  timestamp: string;
  amount: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export interface CloudinaryImage {
  public_id: string;
  version: number;
  format: string;
  width: number;
  height: number;
  type: string;
  created_at: string;
  context?: {
    [key: string]: string;
  };
  metadata?: {
    [key: string]: string;
  };
  tags?: string[];
}
export interface CloudinaryAccount {
  id: string;
  label: string;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GlobalSettings {
  costSettings?: ModelCostSetting[];
}
