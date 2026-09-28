import request from 'supertest';
import 'jest-extended';
import * as options from './fixtures/options.json';
import * as previewJSON from './fixtures/preview.json';
import AdmZip from 'adm-zip';
import pdf from 'pdf-page-counter';
import {io, Socket} from 'socket.io-client';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

//const ENDPONIT_API_URL = 'https://amcui.ig.he-arc.ch/api';
const ENDPONIT_API_URL = 'http://localhost:9001';
const PROJECT_NAME = 'ci-api-test';
const TEST_USER = 'e2-test-user';
const TEST_PASSWORD = 'e2-test-user';

const api = request(ENDPONIT_API_URL);
let token: string;
let socket: Socket;

const studentCsv = 'id,name\n101,Alice\n102,Bob\n';

// Register before starting the request so fast jobs cannot finish unnoticed.
async function runAmcJob(
  event: 'log' | 'print' | 'annotate',
  matches: (message: any) => boolean,
  start: () => PromiseLike<unknown>,
): Promise<any> {
  let cleanup = () => {};
  const completed = new Promise<any>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}\n${output}`)), 30000);
    const onLog = (message: any) => {
      if (message.data) output = (output + message.data + '\n').slice(-8000);
      if (message.action === 'end' && message.code !== undefined && message.code !== 0)
        reject(new Error(`${message.msg} exited with ${message.code}\n${output}`));
    };
    const onEnd = (message: any) => {
      if (message.action === 'end' && matches(message)) resolve(message);
    };
    const onDisconnect = (reason: string) => reject(new Error(`Socket disconnected: ${reason}`));
    socket.on('log', onLog);
    socket.on(event, onEnd);
    socket.on('disconnect', onDisconnect);
    cleanup = () => {
      clearTimeout(timer);
      socket.off('log', onLog);
      socket.off(event, onEnd);
      socket.off('disconnect', onDisconnect);
    };
  });
  try {
    const [, message] = await Promise.all([Promise.resolve().then(start), completed]);
    return message;
  } finally {
    cleanup();
  }
}

describe('Login', () => {
  it('should respond', async () => {
    await api
      .get('/')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
  });

  it('should require authorization', async () => {
    await api.get('/project/list').expect(401);
  });
  it('should login/create user', async () => {
    const res = await api
      .post('/login')
      .send({username: TEST_USER, password: TEST_PASSWORD})
      .expect(200);
    token = res.body.token;
  });

  it('should not change password if password wrong', async () => {
    await api
      .post('/changePassword') // TODO fix url
      .send({
        username: TEST_USER,
        password: 'password',
        newPassword: 'password2',
      })
      .expect(404);
  });

  it('should change password for a user if password known', async () => {
    await api
      .post('/changePassword') // TODO fix url
      .send({
        username: TEST_USER,
        password: TEST_PASSWORD,
        newPassword: `${TEST_PASSWORD}2`,
      })
      .expect(200);
    await api
      .post('/changePassword') // TODO fix url
      .send({
        username: TEST_USER,
        password: `${TEST_PASSWORD}2`,
        newPassword: TEST_PASSWORD,
      })
      .expect(200);
    // client has to ask for a new token via login
  });
});

describe('Project', () => {
  it('can create project', async () => {
    await api
      .post('/project/create')
      .send({project: PROJECT_NAME})
      .set('Authorization', `Bearer ${token}`)
      //TODO FIX .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.text).toMatch(PROJECT_NAME);
      });
  });

  it('fails to create existing project', async () => {
    await api
      .post('/project/create')
      .send({project: PROJECT_NAME})
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('should list project', async () => {
    await api
      .get('/project/list')
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              project: PROJECT_NAME,
              users: [TEST_USER],
            }),
          ])
        );
      });
    // Subscribe only after project creation and its permissions are confirmed.
    socket = io(ENDPONIT_API_URL + '/', {
      auth: {token: `Bearer ${token}`},
      autoConnect: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect_error', reject);
      socket.once('connect', () => {
        socket.off('connect_error', reject);
        socket.emit('listen', PROJECT_NAME);
        resolve();
      });
      socket.connect();
    });
  });

  // TODO: test auto-match

  it('should set students.csv', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/csv`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/csv')
      .send(studentCsv)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({log: ''});
      });
  });

  it('should get students.csv', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.text).toMatch(studentCsv);
      });
  });

  // must visit csv first or ws connection to register a visit
  it('should list recent project', async () => {
    await api
      .get('/project/recent')
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject([PROJECT_NAME]);
      });
  });

  it('should set project options', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/options`)
      .send({options})
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('should get project options', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/options`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            options: expect.objectContaining({
              auto_capture_mode: '0',
            }),
            users: [TEST_USER],
          })
        );
      });
  });

  //requires options call to have a commit
  it('should get git log', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/gitlogs`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              msg: 'options',
              username: TEST_USER,
            }),
          ])
        );
      });
  });
});

describe('Permissions', () => {
  it('should add user to project', async () => {
    const newUser = 'ci-test-newuser';
    await api
      .post(`/project/${PROJECT_NAME}/add`)
      .send({username: newUser})
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await api
      .get(`/project/${PROJECT_NAME}/options`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            users: expect.arrayContaining([newUser, TEST_USER]),
          })
        );
      });
  });

  it('should remove user from project', async () => {
    const newUser = 'ci-test-newuser';
    await api
      .post(`/project/${PROJECT_NAME}/remove`)
      .send({username: newUser})
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await api
      .get(`/project/${PROJECT_NAME}/options`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            users: [TEST_USER],
          })
        );
      });
  });
});

describe('Admin', () => {
  //TODO check permission denied for normal user

  it('admin can get stats', async () => {
    await api
      .get(`/admin/stats`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            projects: expect.objectContaining({
              [PROJECT_NAME]: {
                students: 3, // TODO: FIX server to filter empty line
                commits: 1,
              },
            }),
            users: expect.objectContaining({
              admin: expect.arrayContaining([PROJECT_NAME]),
            }),
          })
        );
      });
  });

  it('admin can get du', async () => {
    await api
      .get(`/admin/du`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            [PROJECT_NAME]: expect.objectContaining({folders: expect.arrayContaining([])}),
          })
        );
      });
  });
});

describe('Graphics', () => {
  it('should upload an image and make a thumb', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/upload/graphics`) // TODO fix url?
      .set('Authorization', `Bearer ${token}`)
      .attach('file', './tests/e2e/fixtures/test.jpg')
      .field({id: 'img'})
      .expect(200);
    await api
      .get(`/project/${PROJECT_NAME}/static/graphics/img_thumb.jpg`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('should upload a pdf and make a thumb', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/upload/graphics`) // TODO fix url?
      .set('Authorization', `Bearer ${token}`)
      .attach('file', './tests/e2e/fixtures/test.pdf')
      .field({id: 'pdf'})
      .expect(200);
    await api
      .get(`/project/${PROJECT_NAME}/static/graphics/pdf_thumb.jpg`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  //TODO test makethumb of missing
  it('should list graphics files', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/graphics/sync`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining(['img.jpg', 'pdf.pdf'])
        );
      });
  });

  it('should delete graphics files', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/graphics/delete`)
      .set('Authorization', `Bearer ${token}`)
      .send({id: 'img', filename: 'test.jpg'})
      .expect(200);
    await api
      .post(`/project/${PROJECT_NAME}/graphics/delete`)
      .set('Authorization', `Bearer ${token}`)
      .send({id: 'pdf', filename: 'test.pdf'})
      .expect(200);
  });
});

describe('Project Gradefiles', () => {
  const gradefiles = [{data: [{id: 'test'}]}];
  it('should set gradefiles', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/gradefiles`)
      .set('Authorization', `Bearer ${token}`)
      .send(gradefiles)
      .expect(200);
  });

  it('should get gradefiles', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/gradefiles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      // TODO fix application/json?
      .expect((res) => {
        expect(res.text).toMatch(JSON.stringify(gradefiles));
      });
  });
});

describe('Project AMC Edit', () => {
  it('can copy a template', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/copy/template`)
      .set('Authorization', `Bearer ${token}`)
      .send({template: 'HEG-QCM'})
      .expect(200)
      .expect((res) => {
        expect(res.text).toMatch(/logo_heg/);
      });
  });

  it('can generate a preview file', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/upload/graphics`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', './tests/e2e/fixtures/test.pdf')
      .field({id: 'gaff4f316-f5bc-4981-bd27-f81c53072d69'})
      .expect(200);
    await runAmcJob('log', (log) => log.msg === 'preview', () =>
      api.post(`/project/${PROJECT_NAME}/preview`)
        .set('Authorization', `Bearer ${token}`)
        .send(previewJSON)
        .expect(200),
    );
    const res = await api
      .get(`/project/${PROJECT_NAME}/static/out/out.pdf`)
      .set('Authorization', `Bearer ${token}`)
      .responseType('blob')
      .expect(200);
    expect((await pdf(res.body)).numpages).toBe(6);
  }, 35000);

  it('can generate a print', async () => {
    const log = await runAmcJob('print', () => true, () =>
      api.post(`/project/${PROJECT_NAME}/print`)
        .set('Authorization', `Bearer ${token}`)
        .send(previewJSON)
        .expect(200),
    );
    expect(log.pdfs).toContain('sheet-0001.pdf');
    const res = await api
      .get(`/project/${PROJECT_NAME}/static/pdf/${log.pdfs[0]}`)
      .set('Authorization', `Bearer ${token}`)
      .responseType('blob')
      .expect(200);
    expect((await pdf(res.body)).numpages).toBe(6);
  }, 35000);

  it('should get print as a zip', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/zip/pdf`)
      .set('Authorization', `Bearer ${token}`)
      .responseType('blob')
      .expect(200)
      .expect('Content-Type', /application\/zip/)
      .expect((res) => {
        const zipEntries = new AdmZip(res.body)
          .getEntries()
          .map((e) => e.entryName);
        expect(zipEntries).toEqual(
          expect.arrayContaining([
            'catalog.pdf',
            'calage.xy',
            'corrige.pdf',
            'print.bat.txt',
            'sujets/sheet-0001.pdf',
          ])
        );
      });
  });
});

describe('Project AMC Scan', () => {
  // TODO fix pdf and larger examples?
  it('should upload a pdf and capture', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', './tests/e2e/fixtures/scan.tif')
      .field({id: 'img'})
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect((res) => {
        expect(res.body.logAnalyse).toMatch(
          'Page : +1/5/56+\n===<analyse>=+1\n===<analyse>=+1\n'
        );
      });
  });

  it('get capture data', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/capture`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              copy: 0,
              id: '1/5:0',
              page: 5,
              student: 1,
              timestamp_manual: 0,
            }),
          ])
        );
      });
  });

  it('get capture student page copy', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/capture/1/5:0`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            layout_image: 'page-1-5.jpg',
            src: expect.stringMatching(/^%PROJET\/scans\/(?:scan_0001|1_scan)\.tif$/),
          })
        );
      });
  });

  it('get zones student page copy', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/zones/1/5:0`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              answer: 1,
              manual: -1,
              question: 1,
            }),
          ])
        );
      });
  });

  it('can change answer to manual', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/capture/setmanual`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: 1,
        page: 5,
        copy: 0,
        type: 4,
        id_a: 1,
        id_b: 1,
        manual: 1,
      })
      .expect(200);
    await api
      .get(`/project/${PROJECT_NAME}/zones/1/5:0`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              answer: 1,
              manual: 1,
              question: 1,
            }),
          ])
        );
      });
  });

  it('can change answer to auto', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/capture/setauto`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: 1,
        page: 5,
        copy: 0,
      })
      .expect(200);
    await api
      .get(`/project/${PROJECT_NAME}/zones/1/5:0`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              answer: 1,
              manual: -1,
              question: 1,
            }),
          ])
        );
      });
  });
});

describe('Project AMC Grade', () => {
  it('get scoring result', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/scoring`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200);
    //TODO check state?
  });

  it('get matched names', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/names`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      //.expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              auto: null,
              copy: 0,
              image: 'name-1.jpg',
              manual: null,
              page: 5,
              student: 1,
            }),
          ])
        );
      });
  });

  it('set manual association', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/association/manual`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: 1,
        copy: 0,
        id: 101,
      })
      //.expect('Content-Type', /application\/json/)
      .expect(200);
    await api
      .get(`/project/${PROJECT_NAME}/names`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      //.expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              auto: null,
              copy: 0,
              image: 'name-1.jpg',
              manual: '101',
              page: 5,
              student: 1,
            }),
          ])
        );
      });
  });

  it('start mark', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/mark`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200);
    // check state?
  });

  it('get scores', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/scores`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              copy: 0,
              id: '101',
              page: 5,
              question: 1,
              score: 1,
              student: 1,
            }),
          ])
        );
      });
  });

  it('get scores in ods', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/ods`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('can generate annotation single', async () => {
    const log = await runAmcJob('annotate', () => true, () =>
      api.post(`/project/${PROJECT_NAME}/annotate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ids: [1]})
        .expect(200),
    );
    expect(log.file).toBe('cr/corrections/pdf/101_Alice.pdf');
    const res = await api
      .get(`/project/${PROJECT_NAME}/static/${log.file}`)
      .set('Authorization', `Bearer ${token}`)
      .responseType('blob')
      .expect(200);
    expect((await pdf(res.body)).numpages).toBe(1);
  }, 35000);

  it('should get annotate as a zip', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/zip/annotate`)
      .set('Authorization', `Bearer ${token}`)
      .responseType('blob')
      .expect(200)
      .expect('Content-Type', /application\/zip/)
      .expect((res) => {
        const zipEntries = new AdmZip(res.body)
          .getEntries()
          .map((e) => e.entryName);
        expect(zipEntries).toEqual(
          expect.arrayContaining([
            'print.bat.txt',
            'extractFirstPage.bat.txt',
            'annotate/101_Alice.pdf',
          ])
        );
      });
  });
});

describe('Project folder/files', () => {
  it('should get project folder as zip', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/zip`)
      .set('Authorization', `Bearer ${token}`)
      .responseType('blob')
      .expect(200)
      .expect('Content-Type', /application\/zip/)
      .expect((res) => {
        const zipEntries = new AdmZip(res.body)
          .getEntries()
          .map((e) => e.entryName);
        expect(zipEntries).toEqual(
          expect.arrayContaining([
            'options.xml',
            'students.csv',
            'data/association.sqlite',
            'data/capture.sqlite',
            'data/scoring.sqlite',
          ])
        );
      });
  }, 20000);

  it('should get file', async () => {
    await api
      .get(`/project/${PROJECT_NAME}/static/students.csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.text).toMatch(studentCsv);
      });
  });

  it('rename existing project', async () => {
    const newName = `${PROJECT_NAME}2`;
    await api
      .post(`/project/${PROJECT_NAME}/rename`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .send({name: newName})
      .expect(200)
      .expect((res) => {
        expect(res.text).toMatch(newName);
      });
    await api
      .get(`/project/${newName}/options`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            options: expect.objectContaining({
              auto_capture_mode: '0', // ensure modified file from preivous test
            }),
            users: [TEST_USER],
          })
        );
      });
  });
});

describe('Project cleanup', () => {
  it('cannot delete missing project', async () => {
    await api
      .post(`/project/${PROJECT_NAME}/delete`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('delete existing project', async () => {
    await api
      .post(`/project/${PROJECT_NAME}2/delete`)
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});

afterAll(() => {
  socket?.disconnect();
});
// at end call /debug-exit to generate coverage report

/*
/project/:project/capture/delete
/project/:project/missing

*/
/*

/project/:project/reset/lock
/project/:project/revert

/project/:project/copy/project
/project/:project/copy/graphics
/project/:project/copy/codes

websocket events

[ Unit tests ]
createProject
commitGit
makeThumb
saveSourceFilesSync
u2f
calculateMarks

*/
