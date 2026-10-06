// Run inside the disposable server container, with no production data mounts.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import bcrypt from 'bcrypt';
import {createClient} from 'redis';
import ACL from 'acl2';
import {DatabaseSync} from 'node:sqlite';
import {PDFDocument} from 'pdf-lib';
import * as Y from 'yjs';
import {createSection, putEntity, readExam} from '@amcui/exam-core';

const root = process.env.AMCUI_PROJECTS_DIR;
assert(
  root?.startsWith('/tmp/amcui-smoke-'),
  'Disposable project directory required',
);
const base = 'http://127.0.0.1:9001';
const username = 'admin-smoke-' + randomUUID();
const project = 'archive-smoke-' + randomUUID();
const copy = project + '-copy';
const redis = await createClient({url: 'redis://redis:6379'}).connect();
const acl = new ACL(new ACL.redisBackend({redis, prefix: 'acl'}));
let jwt;
async function http(route, body, expected = 200) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? {Authorization: 'Bearer ' + jwt} : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, expected, route + ': ' + text);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function job(id) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const row = (await http('/admin/jobs')).find((row) => row.id === id);
    if (['failed', 'completed'].includes(row?.state)) {
      assert.equal(row.state, 'completed', row.error);
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Job timed out');
}
try {
  const password = randomUUID();
  await redis.SET(
    'user:' + username,
    JSON.stringify({username, password: await bcrypt.hash(password, 4)}),
  );
  await acl.addUserRoles(username, ['admin', project]);
  await acl.allow(project, '/project/' + project, 'admin');
  jwt = (await http('/login', {username, password})).token;
  const previous = jwt;
  const enrollment = await http('/profile/addAuthenticator', {
    password,
    label: 'test-mfa',
  });
  jwt = enrollment.token;
  assert(enrollment.qrCodeDataUrl);
  assert(jwt !== previous);
  const revoked = await fetch(base + '/admin/metrics', {
    headers: {Authorization: 'Bearer ' + previous},
  });
  assert.equal(revoked.status, 401);
  assert(
    !JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
      .authenticators[0].secret,
  );
  jwt = (
    await http('/profile/removeMFA', {
      password,
      label: 'test-mfa',
      type: 'authenticator',
    })
  ).token;
  await http('/login', {username: {}, password}, 400);
  await http('/');
  const folder = path.join(root, project);
  for (const name of [
    'data',
    'scans',
    'out',
    'cr/corrections/pdf',
    'src/graphics',
    '.git',
  ])
    await fs.ensureDir(path.join(folder, name));
  await fs.writeFile(
    path.join(folder, 'options.xml'),
    '<project><doc_question>sujet.pdf</doc_question><note_min>1</note_min><note_max>6</note_max><note_grain>0.1</note_grain><points_max>10</points_max><final_grade_formula>row.Grade</final_grade_formula></project>',
  );
  await fs.writeFile(
    path.join(folder, 'students.csv'),
    'id,name,Total,Grade,FinalGrade\n00123,Example Student,8,5,5\n',
  );
  const schemas = {
    capture:
      "CREATE TABLE capture_page(student INTEGER,page INTEGER,copy INTEGER,src TEXT,timestamp_auto INTEGER,timestamp_manual INTEGER,timestamp_annotate INTEGER); INSERT INTO capture_page VALUES(1,1,0,'%PROJET/scans/a.png',10,10,20); CREATE TABLE capture_failed(filename TEXT); CREATE TABLE capture_zone(imagedata BLOB); INSERT INTO capture_zone VALUES(zeroblob(2000000));",
    scoring:
      "CREATE TABLE scoring_score(student INTEGER,copy INTEGER,question INTEGER,score REAL,max REAL,why TEXT); INSERT INTO scoring_score VALUES(1,0,1,8,10,''); CREATE TABLE scoring_title(question INTEGER,title TEXT); INSERT INTO scoring_title VALUES(1,'Q1'); CREATE TABLE scoring_question(student INTEGER,question INTEGER,indicative INTEGER); INSERT INTO scoring_question VALUES(1,1,0);",
    association:
      "CREATE TABLE association_association(student INTEGER,copy INTEGER,manual TEXT,auto TEXT); INSERT INTO association_association VALUES(1,0,NULL,'00123');",
    layout: 'CREATE TABLE layout_page(student INTEGER);',
    report:
      "CREATE TABLE report_student(student INTEGER,copy INTEGER,file TEXT,type INTEGER); INSERT INTO report_student VALUES(1,0,'student.pdf',1); CREATE TABLE report_directory(type INTEGER,directory TEXT); INSERT INTO report_directory VALUES(1,'cr/corrections/pdf');",
  };
  for (const [name, sql] of Object.entries(schemas)) {
    const db = new DatabaseSync(path.join(folder, 'data', name + '.sqlite'));
    db.exec(sql);
    db.close();
  }
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  await fs.writeFile(path.join(folder, 'out/sujet.pdf'), bytes);
  await fs.writeFile(
    path.join(folder, 'cr/corrections/pdf/student.pdf'),
    bytes,
  );
  await fs.writeFile(path.join(folder, 'scans/a.png'), 'synthetic scan');
  await fs.writeFile(path.join(folder, '.git/history'), 'history');
  const doc = new Y.Doc();
  putEntity(doc, 'sections', createSection());
  await fs.writeJson(path.join(folder, 'data.json'), readExam(doc));
  doc.destroy();
  const measured = await http('/admin/inventory', {project}, 202);
  await job(measured.id);
  const preview = await http(
    '/admin/project/' + project + '/archive/preview',
    {},
  );
  assert(preview.bytes > 2000000);
  const queued = await http('/admin/project/' + project + '/archive', {}, 202);
  const result = await job(queued.id);
  assert(result.result.reclaimedBytes > 1000000);
  const snapshot = await http('/project/' + project + '/archive');
  assert.equal(snapshot.results.rows[0].id, '00123');
  assert.equal(snapshot.results.rows[0].FinalGrade, 5);
  for (const name of ['scans', '.git', 'data', 'cr', 'out'])
    assert.equal(await fs.pathExists(path.join(folder, name)), false);
  await http('/project/' + project + '/print', {}, 409);
  await http('/project/' + project + '/mark', undefined, 409);
  const download = await fetch(
    base + '/project/' + project + '/archive/files/papers',
    {headers: {Authorization: 'Bearer ' + jwt}},
  );
  assert.equal(download.status, 200);
  assert((await download.arrayBuffer()).byteLength > 100);
  await http('/project/' + project + '/copy/project', {project: copy});
  assert.equal(
    (await http('/project/' + copy + '/options')).status.archived,
    undefined,
  );
  assert(
    !(
      await fs.readFile(path.join(root, copy, 'students.csv'), 'utf8')
    ).includes('Example Student'),
  );
  await http('/admin/project/' + project + '/delete', {});
  await http('/project/' + copy + '/delete', {});
  await http('/admin/user/' + username + '/state', {status: 'disabled'}, 409); // Last administrator is protected.
  console.log(
    'PASS: full HTTP admin inventory → verified archive worker → static grades/PDF → grading blocked → fresh copy → cleanup; malformed login and last-admin protection',
  );
} finally {
  if (jwt) {
    await http('/admin/project/' + project + '/delete', {}).catch(() => {});
    await http('/project/' + copy + '/delete', {}).catch(() => {});
  }
  for (const role of await acl.userRoles(username))
    await acl.removeUserRoles(username, role);
  await redis.DEL('user:' + username);
  await redis.quit();
}
