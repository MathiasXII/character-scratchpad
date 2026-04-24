import assert from 'node:assert/strict';

describe('Character Scratch Pad', () => {
  it('App loads', async () => {
    const title = await browser.getTitle();
    assert.equal(title, 'Character Scratch Pad');

    const app = $('#app');
    await app.waitForExist({ timeout: 10000 });
    assert.equal(await app.isExisting(), true);
  });

  it('Two-pane layout', async () => {
    const leftPane = $('#left-pane');
    const rightPane = $('#right-pane');

    await leftPane.waitForExist({ timeout: 10000 });
    await rightPane.waitForExist({ timeout: 10000 });

    assert.equal(await leftPane.isExisting(), true);
    assert.equal(await rightPane.isExisting(), true);
  });

  it('Settings button exists', async () => {
    const settingsButton = $('#settings-btn');
    await settingsButton.waitForExist({ timeout: 10000 });
    assert.equal(await settingsButton.isExisting(), true);
  });
});
