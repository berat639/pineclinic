import { readFileSync } from 'fs';
const formData = new FormData();
const blob = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'application/dicom' });
formData.append('file', blob, '0000.dcm');
const res = await fetch('http://localhost:3000/api/dental/upload-dcm', {
  method: 'POST',
  body: formData
});
console.log(res.status, await res.text());
