export let nsMixin = {
    /** @param {Number} millis */
    async sleep(millis) {
        await this.ns.sleep(millis);
    }
}