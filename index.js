import EventModule from './structures/EventModule.js'
import CommandList from './structures/CommandList.js'
import fs from 'fs'
import { dirname, resolve } from 'path'
import ImportDir from '@yimura/import-dir'

import BaseCommand from './structures/commands/BaseCommand.js'

export default class CommandRegistrar extends EventModule {
    commandList = new CommandList();

    constructor(main) {
        super(main);

        this.register(CommandRegistrar, {
            name: 'commandRegistrar'
        });

        Object.assign(this, {
           BaseCommand
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
        modulePath = dirname(modulePath).replace('file://', '');

        const commands = ImportDir(modulePath + '/commands/', { recurse: true, noCache: true });

        await this._recursiveRegister(groupName, commands);
    }

    /**
     * @private
     * @param {string} category The original category this bit was part of
     * @param {Object} bits The command category object within a category folder
     */
    async _recursiveRegister(category, bits) {
        for (const bit in bits) {
            if (bits.hasOwnProperty(bit)) {
                if (bits[bit] instanceof Promise) {
                    try {
                        bits[bit] = (await bits[bit]).default;

                        const instance = new bits[bit](category, this._m);
                        if (instance.disabled) {
                            this.log.warn('COMMANDS', `Command disabled: "${instance.name}"`);

                            continue;
                        }

                        if (instance.permissions && instance.permissions.levels.filter(x => x.type === 'COMMAND_HANDLED').length == 1) {
                            if (!instance.permission || typeof instance.permission !== 'function') {
                                this.log.error('COMMANDS', `Command "${instance.name}" has COMMAND_HANDLED permission set but doesn't handle these!`);

                                continue;
                            }
                        }

                        this.commandList.set(instance.name, instance);

                        if (this.output && !instance.hidden) {
                            this._updateOutput(category, instance.raw);
                        }
                        else if (instance.hidden) {
                            this.log.info('COMMANDS', `Command hidden: "${instance.name}"`);
                        }

                        for (const alias of instance.aliases) {
                            this.commandList.set(alias, instance);
                        }

                        continue;
                    } catch (e) {
                        e.ignore = true;

                        this.log.warn('COMMANDS', `The following command: ${bit}\nGenerated the following error:\n${e.stack}`);
                    }
                }

                await this._recursiveRegister(category, bits[bit]);
            }
        }
    }

    /**
     * @param {Object} commanObj
     */
    _updateOutput(category, commanObj) {
        if (!this.output[category]) this.output[category] = [];

        this.output[category].push(commanObj);

        clearTimeout(this.writeTimeout);
        this.writeTimeout = setTimeout(() => {
            fs.writeFile(resolve(`./data/commands.json`), JSON.stringify(this.output, null, '    '), { flag: 'w+' }, (err) => {
                if (err) {
                    throw err;
                }

                this.log.info('COMMANDS', 'Generated new "data/commands.json" with the mapped commands.');
            });
        }, 500);
    }

    async init() {
        const commands = ImportDir(resolve(`./src/commands/`), { recurse: true, noCache: true });

        this.commandList = new CommandList();
        if (this.config.development && this.config.generate_command_json) this.output = {};

        for (const categoryName in commands)
            if (commands.hasOwnProperty(categoryName))
                await this._recursiveRegister(categoryName, commands[categoryName]);

        this.log.info('COMMANDS', `Mapping of commands done with ${this.commandList.registered} unique commands registered, ${this.commandList.size - this.commandList.registered} aliases registered.`);

        this.globalStorage.set('prefix', this.config.development ? this.config.default_prefix.dev : this.config.default_prefix.prod);

        this.emit('ready');

        return true;
    }
}
