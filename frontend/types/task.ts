export interface Task {
  id: number;
  original_filename: string;
  status: 'pending' | 'parsing' | 'parsed' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  result: any;
  error_message?: string;
}
