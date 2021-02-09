import EventModule from './structures/EventModule.js'
import CommandList from './structures/CommandList.js'
import fs from 'fs'
import { resolve } from 'path'
import ImportDir from '@yimura/import-dir'

export default class CommandRegistrar extends EventModule {
    commandList = new CommandList();

    constructor(main) {
        super(main);

        this.register(CommandRegistrar, {
            name: 'commandRegistrar'
        });
    }

    /**
     * @param {string} commandName
     */
    get(commandName) {
        return this.commandList.get(commandName);
    }

    /**
     * Register commands from a module
     * @param {string} groupName The name to group the commands under
     * @param {string} modulePath Path to the root of the module (you should have a folder called "commands")
     * @param {boolean} [output = true] If the commands should be included in the generation of commands.json
     */
    async registerCommands(groupName, modulePath, output = true) {
        modulePath = modulePath.replace('file://', '');

        const commands = ImportDir(modulePath + '/commands/', { recurse: true, noCache: true });

        await this._recursiveRegister(groupName, commands);
    }

    /**
     * @private
     * @param {string} category The original category this bit was part of
     * @param {Object} bits The command category object within a category folder
     * @param {string} [parentBit=''] Defaults to an empty string
     */
    async _recursiveRegister(category, bits, parentBit = '') {
        for (const bit in bits) {
            if (bits.hasOwnProperty(bit)) {
                if (bits[bit] instanceof Promise) {
                    try {
                        bits[bit] = (await bits[bit]).default;

                        const instance = new bits[bit](category, this._m);
                        if (instance.disabled) {
                            this.log.warn('COMMANDS', `Command disabled: '${parentBit}${instance.name}'`);

                            continue;
                        }

                        if (instance.permissions && instance.permissions.levels.filter(x => x.type === 'COMMAND_HANDLED').length == 1) {
                            if (!instance.permission || typeof instance.permission !== 'function') {
                                this.log.error('COMMANDS', `Command '${parentBit}${instance.name}' has COMMAND_HANDLED permission set but doesn't handle these!`);

                                continue;
                            }
                        }

                        const name = `${parentBit}${instance.name}`;
                        this.commandList.set(name, instance);

                        if (this.output && !instance.hidden) {
                            if (parentBit.length == 0) {
                                this.output[category].commands.push(instance.raw);
                            }
                            else {
                                if (!this.output[category].children) this.output[category].children = {};
                                if (!this.output[category].children[parentBit.trim()]) this.output[category].children[parentBit.trim()] = [];

                                this.output[category].children[parentBit.trim()].push(instance.raw);
                            }
                        }
                        else if (instance.hidden) {
                            this.log.info('COMMANDS', `Command hidden: '${parentBit}${instance.name}'`);
                        }

                        for (const alias of instance.aliases) {
                            this.commandList.set(`${parentBit}${alias}`, instance);
                        }

                        continue;
                    } catch (e) {
                        e.ignore = true;

                        this.log.warn('COMMANDS', `The following command: ${parentBit}${bit}\nGenerated the following error:\n${e.stack}`);
                    }
                }

                await this._recursiveRegister(category, bits[bit], `${parentBit}${bit} `);
            }
        }
    }

    async init() {
        const commands = ImportDir(resolve(`./src/commands/`), { recurse: true, noCache: true });

        this.commandList = new CommandList();
        if (this.config.development && this.config.generate_command_json) this.output = {};

        for (const categoryName in commands) {
            if (commands.hasOwnProperty(categoryName)) {
                if (this.output) this.output[categoryName] = { commands: [] };

                await this._recursiveRegister(categoryName, commands[categoryName]);
            }
        }

        this.log.info('COMMANDS', `Mapping of commands done with ${this.commandList.registered} unique commands registered, ${this.commandList.size - this.commandList.registered} aliases registered.`);

        if (this.output) {
            fs.writeFile(resolve(`./data/commands.json`), JSON.stringify(this.output, null, '    '), { flag: 'w+' }, (err) => {
                if (err) {
                    throw err;
                }

                this.log.info('COMMANDS', 'Generated new "data/commands.json" with the mapped commands.');
            });

            delete this.output;
        }

        this.globalStorage.set('prefix', this.config.development ? this.config.default_prefix.dev : this.config.default_prefix.prod);

        this.emit('ready');

        return true;
    }
}
