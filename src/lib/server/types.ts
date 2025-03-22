export interface PushSubscription {
  id: number;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
  updatedAt: Date;
} 