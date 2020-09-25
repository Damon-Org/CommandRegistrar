export default class CommandList extends Map {
    _cache = new Map();
    _registered = [];

    constructor() {
        super();
    }

    get registered() {
        return this._registered.length;
    }

    /**
     * @private
     * @param {string} commandName
     * @param {string} category
     */
    _addCommandToCategory(commandName, categoryName) {
        const category = this._cache.get(categoryName);
        this._registered.push(commandName);

        if (!category) {
            const list = [];
            list.push(commandName);
            this._cache.set(categoryName, list);

            return;
        }

        category.push(commandName);
    }

    /**
     * @param {string} categoryName
     * @returns {Array<string>} A string of command names is returned from within a category
     */
    getCommandsFromCategory(categoryName) {
        return this._cache.get(categoryName);
    }

    /**
     * @param {string} command
     * @param {Object} instance
     */
    set(command, instance) {
        if (!this._registered.includes(instance.name)) this._addCommandToCategory(command, instance.category);

        super.set(command, instance);
    }
}
