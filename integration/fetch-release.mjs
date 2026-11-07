// Fetch a maintainer-signed Windows release. Installing never needs a private key.
import {readFile,mkdir,cp,copyFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {latestRelease,installRuntime,prepareMedia} from './release-store.mjs';
const source=dirname(fileURLToPath(import.meta.url)),key=await readFile(join(source,'release-public.pem'),'utf8');
const release=await latestRelease(key);if(!release)throw Error('No signed Windows release is available');
const cache=join(source,'release-work'),runtime=await installRuntime(cache,release,key),media=await prepareMedia(cache,release.manifest);
const output=join(source,'dist',release.manifest.version);await mkdir(output,{recursive:true});
await cp(runtime.directory,join(output,'runtime'),{recursive:true});await copyFile(media.path,join(output,'media.json'));
console.log(JSON.stringify({version:release.manifest.version,bundle:output,signatureVerified:true}));
