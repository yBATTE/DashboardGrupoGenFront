import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/axios';
import { useState } from 'react';

export default function TaskForm(){
  const qc = useQueryClient();
  const [title,setTitle] = useState('');
  const [visibility,setVisibility] = useState<'private'|'team'|'project'|'custom'>('private');
  const { mutate, isPending } = useMutation({
    mutationFn: (payload:any)=> api.post('/tasks', payload),
    onSuccess: ()=> qc.invalidateQueries({ queryKey:['tasks'] }),
  });
  return (
    <form onSubmit={(e)=>{ e.preventDefault(); mutate({ title, visibility }); }} style={{maxWidth:420, margin:'24px', display:'grid', gap:12}} autoComplete='off'>
      <h3>Nueva tarea</h3>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título"/>
      <select value={visibility} onChange={e=>setVisibility(e.target.value as any)}>
        <option value="private">Privada</option>
        <option value="team">Equipo</option>
        <option value="project">Proyecto</option>
        <option value="custom">Custom</option>
      </select>
      <button disabled={isPending}>Crear</button>
    </form>
  );
}
