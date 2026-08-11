import CommandKClient from './CommandKClient';
import { getCommandKData } from './data';

export default async function CommandK() {
  return <CommandKClient {...await getCommandKData()} />;
}
