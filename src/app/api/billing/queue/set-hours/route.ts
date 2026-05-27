import { NextResponse } from 'next/server';
import { setAllowedStartHour, setAllowedEndHour } from '@/lib/billing-queue';

export async function POST(req: Request) {
  try {
    const { start, end } = await req.json();
    if (!start || !end) {
      return NextResponse.json({ error: 'Parâmetros start e end são obrigatórios' }, { status: 400 });
    }
    
    // Simple validation of HH:MM format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      return NextResponse.json({ error: 'Formato de hora inválido. Use HH:MM' }, { status: 400 });
    }

    setAllowedStartHour(start);
    setAllowedEndHour(end);

    return NextResponse.json({ success: true, start, end });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
