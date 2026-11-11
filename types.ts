
export enum UserRole {
  ADMIN = 'ADMIN',
  REGULAR = 'REGULAR'
}

export type ProjectPlatformType = 'desktop' | 'web';

export type AiProvider = 'openai' | 'gemini';

export interface AiModel {
  id: string;
  name: string;
  provider: AiProvider;
  cost1Ref: number;
  cost2Refs: number;
  cost3PlusRefs: number;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function getAiModelPrice(
  model: Pick<AiModel, 'cost1Ref' | 'cost2Refs' | 'cost3PlusRefs'> | undefined | null,
  refs: number
): number {
  if (!model) return 0.06;
  if (refs <= 1) return Number(model.cost1Ref) || 0;
  if (refs === 2) return Number(model.cost2Refs) || 0;
  return Number(model.cost3PlusRefs) || 0;
}

export const DEFAULT_AI_MODEL_CATALOG: AiModel[] = [
  {
    id: 'gpt-image-2.6-flare',
    name: 'gpt-image-2.6-flare',
    provider: 'openai',
    cost1Ref: 0.06,
    cost2Refs: 0.08,
    cost3PlusRefs: 0.10,
    isDefault: true,
  },
  {
    id: 'gpt-image-2.5-flare',
    name: 'gpt-image-2.5-flare',
    provider: 'openai',
    cost1Ref: 0.05,
    cost2Refs: 0.065,
    cost3PlusRefs: 0.08,
    isDefault: false,
  },
  {
    id: 'gpt-image-2',
    name: 'gpt-image-2',
    provider: 'openai',
    cost1Ref: 0.045,
    cost2Refs: 0.06,
    cost3PlusRefs: 0.075,
    isDefault: false,
  },
  {
    id: 'gemini-nano-banana-2.1',
    name: 'gemini-nano-banana-2.1',
    provider: 'gemini',
    cost1Ref: 0.03,
    cost2Refs: 0.04,
    cost3PlusRefs: 0.05,
    isDefault: false,
  },
];

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
  aiModelId?: string | null;
  aiModelProvider?: AiProvider;
  aiApiKey?: string;
  aiModelsList?: string[];
  selectedAiModel?: string;
  referenceImagesCount?: number;
  totalPrintedCopies?: number;
  // Cloudinary
  cloudinaryAccountId?: string | null;
  cloudinaryCloudName?: string;
  cloudinaryTag?: string;
  cloudinaryFolder?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  // Supabase Snake Case Mappings
  project_type?: ProjectPlatformType;
  ai_model_id?: string | null;
  ai_api_key?: string;
  reference_images_count?: number;
  total_printed_copies?: number;
  cloudinary_account_id?: string | null;
  cloudinary_tag?: string;
  cloudinary_folder?: string;
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
    custom?: Record<string, any>;
    [key: string]: any;
  };
  metadata?: {
    [key: string]: any;
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
