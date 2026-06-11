import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ ok: false, message: 'No file provided' }, { status: 400 });
    }
    
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `shotguide-${Date.now()}.${file.name.split('.').pop()}`;
    const filepath = path.join(process.cwd(), 'public', filename);
    
    await fs.writeFile(filepath, buffer);
    
    return NextResponse.json({ ok: true, url: filename });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ ok: false, message: 'Upload failed' }, { status: 500 });
  }
}
