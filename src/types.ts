import { Request } from 'express';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  max_links: number;
  max_clicks_per_month: number;
  features: Record<string, any>;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  subscription_plan_id?: string;
  subscription_status: 'active' | 'expired' | 'cancelled';
  subscription_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserLimits {
  current_links: number;
  max_links: number;
  current_month_clicks: number;
  max_clicks_per_month: number;
  can_create_link: boolean;
}

export interface AuthRequest extends Request {
  user?: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}