import type { RoomModule } from '../packages/room-runtime/types';
import { scanRoom, type ScanJson } from './scan-room';

const office: RoomModule = {id:'office-v4', label:'Wes’s office', build:async () => (await import('./office-v4')).officeV4.build()};

// Your own scans: any data/demos/<id>/scan.json (made by tools/ingest-scan.sh) shows up automatically.
const mine = import.meta.glob<ScanJson>('../data/demos/*/scan.json', { import: 'default' });
const personal: RoomModule[] = Object.entries(mine)
  .map(([path, load]) => ({ id: path.split('/').at(-2)!, load }))
  .filter(({ id }) => !id.startsWith('office-'))
  .map(({ id, load }) => ({ id, label: id.replace(/-/g, ' '), build: async () => scanRoom(id, id, await load()).build() }));

export const ROOMS: RoomModule[] = [office, ...personal];
export const roomById = (id:string|null) => ROOMS.find(r=>r.id===id) ?? ROOMS[0];
export type {BuiltRoom, RoomModule} from '../packages/room-runtime/types';
