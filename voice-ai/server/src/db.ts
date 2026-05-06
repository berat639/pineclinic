import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'

const DATA_FILE = resolve(import.meta.dir, '../../data/appointments.json')

export interface Appointment {
  id: string
  createdAt: string
  customerName: string
  phone: string
  type: 'service' | 'test_drive' | 'gallery_visit' | 'other'
  vehicleInfo?: string
  issueOrRequest?: string
  date: string
  time: string
}

export function readAppointments(): Appointment[] {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return []
  }
}

export function createAppointment(data: Omit<Appointment, 'id' | 'createdAt'>): Appointment {
  const appointments = readAppointments()
  const appointment: Appointment = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...data,
  }
  appointments.push(appointment)
  writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2))
  return appointment
}
