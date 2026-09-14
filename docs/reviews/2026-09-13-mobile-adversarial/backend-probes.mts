import { readFileSync } from 'node:fs';
import { AppDatabase } from '../../../notification-service/src/database.ts';
import { DeviceStore } from '../../../notification-service/src/devices.ts';
import { NotificationQueue } from '../../../notification-service/src/queue.ts';
import { FdaPoller } from '../../../notification-service/src/poller.ts';
import { enrichFromAnnouncement } from '../../../notification-service/src/sources.ts';
import { storedNotice, FakeSource, FakeSender, rss, annual } from '../../../notification-service/test/helpers.ts';

const now = '2026-09-13T20:00:00.000Z';
const output: Record<string, unknown> = {};
const fixture = readFileSync(new URL('../../../notification-service/test/fixtures/fda-announcement.html', import.meta.url),'utf8');
const notice = storedNotice('audit-food', now);
const wrapped = fixture.replace('</h2>\n    <p>Whole Foods', '</h2>\n    <div class="field--item"><p>Whole Foods').replace('<div><h2>Company Contact', '</div><div><h2>Company Contact');
const extracted = enrichFromAnnouncement(notice, { html: wrapped, finalURL: notice.canonicalURL });
output.wrappedTable = {
  sourceHasHazard: wrapped.includes('People with an egg allergy'),
  summaryHasHazard: extracted.summary.includes('People with an egg allergy'),
  sourceHasDisposal: wrapped.includes('Consumers should destroy'),
  summaryHasDisposal: extracted.summary.includes('Consumers should destroy'),
  extractedSummary: extracted.summary,
};

{
  const db = new AppDatabase(':memory:');
  db.upsertNotice({...notice, codeInfo:'LOT-OLD', reasonForRecall:'Undeclared egg'});
  db.upsertNotice({...notice, codeInfo:'LOT-NEW', reasonForRecall:'Undeclared milk', retrievedAt:'2026-09-13T20:15:00.000Z'});
  const saved = db.getStoredNotice(notice.id)!;
  output.updatedNotice = {codeInfo:saved.codeInfo, reasonForRecall:saved.reasonForRecall, retrievedAt:saved.retrievedAt};
  db.close();
}

{
  const db = new AppDatabase(':memory:');
  const devices = new DeviceStore(db);
  const queue = new NotificationQueue(db, devices, new FakeSender());
  const source = new FakeSource();
  source.rss = rss([{slug:'same-url',title:'Food recall',date:'Sun, 13 Sep 2026 12:00:00 EDT'}]);
  const poller = new FdaPoller(db,queue,source,()=>new Date(now));
  await poller.pollOnce();
  const saved = db.listNotices({limit:10}).items[0]!;
  const original = await source.fetchAnnouncement(saved.sourceURL);
  source.announcementDocuments.set(saved.sourceURL,{...original,html:original.html.replace('LOT-123','EXPANDED-LOT-999')});
  const before = source.announcementFetches;
  const result = await poller.pollOnce();
  output.unchangedRssUrl = {result, additionalAnnouncementFetches:source.announcementFetches-before, codeInfo:db.getStoredNotice(saved.id)!.codeInfo};
  db.close();
}

for (const scenario of ['in-flight-token-invalid','remaining-batch-token'] as const) {
  const db = new AppDatabase(':memory:');
  const devices = new DeviceStore(db);
  db.updatePollState({initialized:1,gap_status:'normal',last_success_at:now},now);
  const registration = devices.create('a'.repeat(64),'sandbox',now);
  devices.setWatchlist(registration.deviceId,['salmonella'],now);
  const messages: any[] = [];
  const sender = {configured:true,isConfigured:()=>true,close(){},async send(message:any) {
    messages.push(message);
    if(messages.length===1) {
      devices.updateToken(registration.deviceId,'b'.repeat(64),'sandbox',now);
      if(scenario==='in-flight-token-invalid') return {kind:'invalid' as const,code:'Unregistered'};
    }
    return {kind:'success' as const};
  }};
  const queue = new NotificationQueue(db,devices,sender);
  for(const slug of ['first','second']) {
    const n = storedNotice(slug,now,'Salmonella recall'); db.upsertNotice(n); queue.enqueueNotice(n.id,now);
  }
  await queue.processDue(now);
  const d=devices.get(registration.deviceId)!;
  output[scenario]={currentToken:d.pushIdentifier[0],active:d.active,disabledReason:d.disabledReason,sentTokens:messages.map(m=>m.pushIdentifier[0]),queue:db.connection.prepare('SELECT status,last_error_code FROM delivery_queue ORDER BY id').all()};
  db.close();
}
{
  const db = new AppDatabase(':memory:');
  const queue = new NotificationQueue(db,new DeviceStore(db),new FakeSender());
  const source = new FakeSource();
  const cursor = storedNotice('drug-cursor',now);
  db.upsertNotice({...cursor, foodClassification:'unknown', eligibleForAlert:false});
  db.updatePollState({initialized:1,gap_status:'normal',cursor_key:cursor.canonicalURL,cursor_publication_date:now,last_success_at:now},now);
  const foodAnnual=annual([{slug:'new-food',date:'09/14/2026'}]);
  const drugAnnual=annual([{slug:'drug-cursor',date:'09/13/2026'}]).replace('Food &amp; Beverages, Foodborne Illness','Drugs');
  source.annual=[foodAnnual.replace('</recallsdata>',drugAnnual.replace('<?xml version="1.0"?><recallsdata>',''))];
  source.rss=rss([{slug:'new-food',title:'Food recall',date:'Mon, 14 Sep 2026 12:00:00 EDT'}]);
  const poller=new FdaPoller(db,queue,source,()=>new Date('2026-09-14T17:00:00.000Z'));
  const results=[];
  for(let i=0;i<3;i++) results.push(await poller.pollOnce());
  output.nonFoodCursorGap={annualContainsCursor:source.annual[0].includes(cursor.canonicalURL),results, gapStatus:db.getPollState().gapStatus};
  db.close();
}
console.log(JSON.stringify(output,null,2));
