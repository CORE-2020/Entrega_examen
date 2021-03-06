/* eslint-disable no-invalid-this*/
/* eslint-disable no-undef*/
// IMPORTS
var {modelo, config} = require('./configuration');

const path = require("path");
const Utils = require("./testutils");
const fs = require("fs");
const util = require("util");
const {spawn} = require("child_process");
const exec = util.promisify(require('child_process').exec);

const process = require("process");


const DEBUG =  typeof process.env.DEBUG !== "undefined";
const LOG_SERVER =  typeof process.env.LOG_SERVER !== "undefined";
const WAIT =  typeof process.env.WAIT !== "undefined"?parseInt(process.env.WAIT):50000;
const TIMEOUT =  typeof process.env.TIMEOUT !== "undefined"?parseInt(process.env.TIMEOUT):10000;
const TEST_PORT =  typeof process.env.TEST_PORT !== "undefined"?parseInt(process.env.TEST_PORT):3001;

const SEQUELIZE_CMD =  typeof process.env.SEQUELIZE_CMD !== "undefined"?process.env.SEQUELIZE_CMD:"npx sequelize";

const FILTER = new RegExp(process.env.TESTFILTER, "i");


const path_assignment = path.resolve(typeof process.env.PATH_ASSIGNMENT !== "undefined"?process.env.PATH_ASSIGNMENT:path.join(__dirname, ".."));
const URL = `file://${path_assignment.replace("%", "%25")}`;
const browser = new Browser({"waitDuration": WAIT, "silent": true, "runScripts": false });

console.log(`Trabajando en: ${path_assignment}`);

// CRITICAL ERRORS. Si hay errores críticos, el resto de tests no se lanzan.
let error_critical = null;
let error_any = null;

// Hay que cambiar los IDs si cambia el seeder
const groups = {
    "1": [1, 2, 3, 4], // Geography
    "2":  [5, 6],      // Math
};

const questions = [
    {
        question: 'Capital of Italy',
        answer: 'Rome',
    }, {
        question: 'Captal of Portugal',
        answer: 'Lisbon',
    }, {
        question: 'Capital of Spain',
        answer: 'Madrid',
    }, {
        question: 'Capital of France',
        answer: 'Paris',
    }, {
        question: '1+1=?',
        answer: '2',
    }, {
        question: '5^2=?',
        answer: '25',
    }
];

if(!config) {
    throw Error(`Modelo de examen desconocido!`);
}

// TODO: Integrar bien con un logger
function log() {
    if(DEBUG) {console.log.apply(this, arguments );}
}


var num_tests = 1;

function soloPara(filtro, func) {
    if(filtro.includes(modelo)) {
        func();
    }
}

function comprueba(msg, score, func) {
    msg = `${num_tests}: ${msg}`;
    num_tests++;
    return it(msg, async function () {
        let critical = score < 0;
        this.score = critical? 0 :score;
        this.msg_ok = null;
        this.msg_err = null;
        if(error_critical) {
            this.msg_err = "Un test crítico ha fallado, no podemos continuar hasta que pasen todos los tests críticos.";
            throw Error(this.msg_err);
        } 
        if(FILTER && !(FILTER.test(msg) || FILTER.test(id))) {
            console.log(`Ignorando este test, de acuerdo con los filtros de test: ${FILTER}`);
            return;
        }

        try {
            let res = await func.apply(this, []);
            if (!this.msg_ok){
                this.msg_ok =  "¡Enhorabuena!";
            }
            return;
        } catch(e){
            log("Exception in test:", e);
            error_any = true;
            if (!this.msg_err){
                this.msg_err = e.message;
            }
            if (critical) {
                console.log('Se ha producido un error crítico, se cancelan el resto de tests.');
                error_critical = this.msg_err;
            }
            throw(e);
        }
    });
};


// present y absent son listados de expresiones regulares que deben (o no) encontrarse en el fichero
function comprueba_fichero(fpath, present, absent) {
    present = present || [];
    absent = absent || [];
    let file = path.join(path_assignment, fpath);
    this.msg_err = 'No se puede leer el fichero ${file}.';
    let templ = fs.readFileSync(file, "utf8");
    for(let reg of present) {
            if(!reg.test(templ)) {
                throw Error(`${fpath} no incluye algún elemento importante. Falla con la expresión: ${reg}`);
            };
    }
    for(let reg of absent){
        if(reg.test(templ)) {
            throw Error( `${fpath} incluye ${e}, pero debería haberse borrado`);
        };
    }
}


describe("Tests examen", async function() {

    // Tests que no puntúan, pero sus fallos son CRITICAL. Es un sanity check antes de los tests de verdad.
    describe("Prechecks", function () {
        comprueba("Comprobando que existe el directorio de la entrega...",
                  -1,
                  async function () {
                      this.msg_ok = `Encontrado el directorio '${path_assignment}'`;
                      this.msg_err = `No se encontró el directorio '${path_assignment}'`;
                      const fileexists = await Utils.checkFileExists(path_assignment);

                      fileexists.should.be.equal(true);
                  });


    });


    describe("Funcionales", function(){

            // Hay que dejar al admin el último para la operación de DELETE
            var users = [
                {
                    username: 'pepe',
                    password: '5678',
                    admin: false,
                },
                {
                    username: 'admin',
                    password: '1234',
                    admin: true,
                },
            ];
            const cookie_name = 'connect.sid';
            var cookies = {};

            var server;
            const db_file = path.join(path_assignment, 'quiz_for_tests.sqlite');



            async function asUser(username, fn) {
                browser.deleteCookies();
                let user = users.find(u => u.username == username);

                await browser.visit("/login/");
                await browser.fill('username', user.username);
                await browser.fill('password', user.password);
                await browser.pressButton('Login');

                try{
                    await fn.apply(this, []);
                }catch(e){
                    // Esta parte sólo funciona si se usa asUsers.apply(this, [argumentos]) siempre.
                    // y allUsers.apply, si se usa dentro de esa función.
                    if(!this.msg_err) {
                        this.msg_err = `Fallo con el usuario ${username}`;
                    } else {
                        this.msg_err += `, con el usuario ${username}`;
                    }
                    throw(e);
                }
                browser.deleteCookie(cookie_name);
            }

            async function allUsers(fn) {
                for(var user of users) {
                    await asUser.apply(this, [user.username, async function () {
                        return fn.apply(this, [users[name]]);
                    }]);
                }
            }

            after(async function() {
                if(server) {
                    await server.kill();
                    // Borrar base de datos
                    if(!DEBUG){
                        try{
                            fs.unlinkSync(db_file);
                        }catch(e){
                            // Ignorar el mensaje, el fichero se borra al arrancar también.
                        }
                    }
                }
            });

        before(async function() {

            let err = null;
            try{
                // Crear base de datos nueva y poblarla antes de los tests funcionales. por defecto, el servidor coge quiz.sqlite del CWD
                err = `Existe una base de datos en ${db_file}, pero no hemos podido borrarla.`;
                if (fs.existsSync(db_file)) {
                    fs.unlinkSync(db_file);
                }
                err = "No hemos podido crear la base de datos";
                fs.closeSync(fs.openSync(db_file, 'w'));

                err = "No hemos podido lanzar las migraciones";
                let res = await exec(`${SEQUELIZE_CMD} db:migrate --url="sqlite://${db_file}" --migrations-path='${path.join(path_assignment, "migrations")}'`);
                if(res.stderr != "") {
                    throw Error(`Error en migraciones: ${res.stderr}`);
                }
                log('Lanzadas migraciones')
                err = "No hemos podido lanzar las seeds";
                res = await exec(`${SEQUELIZE_CMD} db:seed:all --url="sqlite://${db_file}" --seeders-path='${path.join(path_assignment, "seeders")}'`);
                if(res.stderr != "") {
                    throw Error(`Error en seeders: ${res.stderr}`);
                }
                log('Lanzados seeders');

                let bin_path = path.join(path_assignment, "bin", "www");

                log(`Usando la base de datos ${db_file}`);
                err = `Parece que no se puede lanzar el servidor con el comando "node ${bin_path}".`;
                server = spawn('node', [bin_path], {env: {PORT: TEST_PORT,
                                                          DATABASE_URL: `sqlite://${path.relative(process.cwd(), db_file)}`,
                                                          MODEL_CONFIG: process.env.MODEL_CONFIG,
                                                          NODE_ENV: 'development',
                                                         }
                                                   });

                // Hay un issue extraño que hace que el servidor deje de funcionar en algún momento de los tests.
                // Añadir el callback aquí, aunque no se ejecute, parece arreglar el problema.
                server.stdout.on('data', function(data) {
                    if(LOG_SERVER) {
                        log('\t\tServer: ', data.toString()); 
                    }
                });

                server.stderr.on('data', function(data) {
                    console.log('\t\tError en el servidor: ', data.toString()); 
                });

                browser.site = `http://localhost:${TEST_PORT}/`;
                const steps = 100;
                for(var i=0; i<(TIMEOUT/steps); i++) {
                    await new Promise(resolve => setTimeout(resolve, steps));

                    // The exit code should be null while the server is running
                    if(server.exitCode) {
                        throw Error("El servidor se ha parado.");
                    }

                    try{
                        await browser.visit("/");
                        browser.assert.status(200);
                        return;
                    }
                    catch(e){
                        log(`No se ha podido contactar con al servidor en ${browser.site}. Reintentando`);
                    }
                }
                throw Error(`No se ha podido contactar con el servidor en: ${browser.site}`);

            } catch(e) {
                console.log('Error en setup: ', err);
                console.log();
                console.log('Este es un error crítico, así que no podemos realizar el resto de tests.');
                console.log();
                console.log(e);
                error_critical = err;
            }
        });

        beforeEach(async function() {
            await browser.deleteCookies();
        });

        soloPara(["Modelo-1", "Modelo-2", "Modelo-3", "Modelo-4", "Modelo-5"], function() {

            let incluyeLogueado = false;

            let viewTitle = "";
            let viewContent = "";
            let pre_content = "";
            let post_content = "";
            let titulo_test = "";
            switch(modelo) {
            case "Modelo-1":
                titulo_test = "la cuenta de quizzes totales";
                pre_content = "Hay 4 quizzes";
                post_content = "Hay 5 quizzes";
                break;
            case "Modelo-2":
                titulo_test = "la cuenta de usuarios totales";
                pre_content = "Hay 2 usuarios";
                post_content = "Hay 3 usuarios";
                break;
            case "Modelo-3":
                titulo_test = "la cuenta de quizzes borrados";
                pre_content = "Se han borrado 4 quizzes";
                post_content = "Se han borrado 1 quizzes";
                // code block
                break;
            case "Modelo-4":
                titulo_test = "la cuenta de ceros borrados";
                pre_content = "Se han borrado 0 ceros";
                post_content = "Se han borrado 1 ceros";
                // code block
                break;
            case "Modelo-5":
                titulo_test = "la cuenta de quizzes creados";
                pre_content = "He creado 0 quizzes";
                post_content = "He creado 1 quizzes";
                // code block
                break;
            default:
            }


            comprueba(`La página principal incluye un enlace para ${config.middlewareName} si estás logueado`,
                      1,
                      async function(){ 
                          this.mgs_err = "Error al visitar la página principal."
                          await browser.visit("/");
                          browser.assert.status(200);
                          await asUser('pepe', async function() {
                              this.msg_err = "No se muestra enlace";
                              browser.assert.elements(`a[href="${config.requestPath}"]`, 1);
                          });
                          incluyeLogueado = true;

                      });

            comprueba(`La página principal no incluye un enlace para ${config.middlewareName} si no estás logueado`,
                      2,
                      async function(){ 
                          if(!incluyeLogueado) {
                                throw Error( "Para que este test pueda aplicarse, primero ha de mostrarse el enlace a usuarios logueados.")
                          }
                          this.mgs_err = "Error al visitar la página principal."
                          await browser.visit("/");
                          browser.assert.status(200);
                          this.msg_err = "Se muestra enlace";
                          browser.assert.elements(`a[href="${config.requestPath}"]`, 0);

                      });
            comprueba(`El middleware no deja ${config.middlewareName} a usuarios no logueados`,
                      2,
                      async function(){ 
                          await browser.visit(config.requestPath);

                          // TODO: cambiar por un assert
                          if ((browser.status != 403) && !browser.url.includes('login')){
                              throw Error("The URL could be accessed");
                          };
                      });

            comprueba(`El middleware deja ${config.middlewareName} a usuarios logueados`,
                      2,
                      async function(){ 
                          await asUser('pepe', async function() {
                              await browser.visit(config.requestPath);
                              browser.assert.status(200);
                              viewTitle = browser.text("section>h1");
                              viewContent = browser.text("section>p");

                          });
                      });


            comprueba(`Se puede añadir un usuario y una pregunta`,
                      0,
                      async function() {
                          await asUser('pepe', async function() {
                              await browser.visit('/quizzes/new/');
                              await browser.fill('question', 'prueba2');
                              await browser.fill('answer', '0');
                              await browser.pressButton('Save');
                              browser.assert.status(200);
                          });
                          await asUser('admin', async function() {
                              await browser.visit('/users/new/');
                              await browser.fill('username', 'guest');
                              await browser.fill('password', '0000');
                              await browser.fill('#user_confirm_password', '0000');
                              await browser.pressButton('Save');
                              browser.assert.status(200);
                          });
                      });

            comprueba(`Se muestra ${titulo_test} correctamente a los usuarios logueados`,
                      3,
                      async function(){ 
                          if(viewContent != pre_content){
                              throw Error(`Se esperaba "${pre_content}" y se obtuvo "${viewContent}"`);
                          }
                          await asUser('pepe', async function() {
                              this.msg_err = `No se puede acceder a ${config.requestPath}`;
                              await browser.visit(config.requestPath);
                              browser.assert.status(200);
                              this.msg_err = `El título h1 no es el adecuado, debería ser "${config.viewTitle}"`;
                              browser.assert.text("section>h1", config.viewTitle);
                              this.msg_err = `Se esperaba "${pre_content}" y se obtuvo "${viewContent}"`;
                              browser.assert.text("section>p", post_content);
                          });
                      });
        });

    });
});

