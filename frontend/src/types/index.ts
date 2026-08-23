export interface User {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: 'admin' | 'doctor' | 'patient';
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  description?: string;
  average_consultation_time: number;
  consultation_fee: number;
  created_at: string;
}

export interface DoctorProfile {
  id: number;
  user_id: number;
  department_id?: number;
  specialization?: string;
  room_number?: string;
  is_available: boolean;
}

export interface DoctorFull {
  id: number;
  user: User;
  department_id?: number;
  specialization?: string;
  room_number?: string;
  is_available: boolean;
}

export interface PatientProfile {
  id: number;
  user_id: number;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  medical_history?: string;
}

export interface PatientFull {
  id: number;
  user: User;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  medical_history?: string;
}

export interface QueueToken {
  id: number;
  token_number: string;
  appointment_time: string;
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'cancelled';
  priority_score: number;
  emergency_level: number;
  symptoms?: string;
  predicted_wait_time: number;
  actual_wait_time?: number;
  department_id: number;
  doctor_id?: number;
  patient_id: number;
  consultation_notes?: string;
  created_at: string;
  updated_at: string;
  payment?: any;
}

export interface QueueTokenDetailed extends QueueToken {
  patient: PatientFull;
  doctor?: DoctorFull;
  department: Department;
}

export interface DepartmentLoad {
  name: string;
  active_count: number;
  avg_wait: number;
}

export interface DashboardMetrics {
  total_patients: number;
  total_doctors: number;
  total_tokens_today: number;
  average_wait_time: number;
  completed_tokens: number;
  skipped_tokens: number;
  cancelled_tokens: number;
  department_loads: DepartmentLoad[];
}
