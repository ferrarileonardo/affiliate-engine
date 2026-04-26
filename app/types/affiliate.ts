export type Affiliate = {
  id: string;
  code: string;
  commissionRate: number;
  isActive?: boolean;
  createdAt?: string | Date;
};
