import Emitter from 'api/emitter';
import EVENTS from 'api/constants/events';
import { PersistentStorage } from 'api/storage';
import { Mock } from 'api/models/mock';
import { Request } from 'api/models/request';

import find from 'lodash/find';
import filter from 'lodash/filter';
import remove from 'lodash/remove';
import isObject from 'lodash/isObject';
import isString from 'lodash/isString';
import isArray from 'lodash/isArray';
import omit from 'lodash/omit';
import cloneDeep from 'lodash/cloneDeep';
import assign from 'lodash/assign';

export class Mocks {

  init() {
    this.loadFromStorage();
    this._registerEvents();
  }

  _registerEvents() {
    Emitter.on(EVENTS.UPDATE_MOCK, this.loadFromStorage, this);
    Emitter.on(EVENTS.IMPORT, this.loadFromStorage, this);
    Emitter.on(EVENTS.STORAGE_PERSIST, this.loadFromStorage, this);
  }

  loadFromStorage() {
    this.all = PersistentStorage.dataTree.mocks
      .map((mock) => new Mock(mock));

    PersistentStorage.dataTree.mocks = this.all;
  }

  setMocks(mocks) {
    this.all = mocks.map((mock) => new Mock(mock));

    PersistentStorage.dataTree.mocks = this.all;
    PersistentStorage.persist();
  }

  find(options) {
    return find(this.all, options);
  }

  findAll(options) {
    const results = filter(this.all, options);

    if (!results) {
      return [];
    }

    return results;
  }

  addMock() {
    const newRequest = new Request({
      method: 'GET',
      url: '/',
      headers: { 'content-type': 'application/json' },
      origin: typeof window !== "undefined" ? window.location.origin : null
    });

    const newMock = this.mockRequest(newRequest);

    PersistentStorage.persist();

    return newMock;
  }

  mockRequest(request) {
    this.findAll({ requestHash: request.requestHash }).forEach((mock) => mock.disable());

    const mock = new Mock(request);
    this.all.push(mock);

    PersistentStorage.persist();

    return mock;
  }

  mergeMocks(mocks, options = {}) {
    for (const mock of mocks) {

      // deserialize json mock request body
      if (isObject(mock.response.body)) {
        mock.response.body = JSON.stringify(mock.response.body);
      }

      if (isObject(mock.params)) {
        mock.params = JSON.stringify(mock.params);
      }

      const existingMock = cloneDeep(find(this.all, { id: mock.id }));

      if (!existingMock) {
        this.all.push(new Mock(mock));
        continue;
      }

      const existingMockClone = cloneDeep(existingMock);
      const newMockClone = cloneDeep(mock);

      if (existingMockClone.response.body) {
        existingMockClone.response.body = existingMockClone.response.body.replace(/\s/g, '');
      }

      if (newMockClone.response.body) {
        newMockClone.response.body = newMockClone.response.body.replace(/\s/g, '');
      }

      const isMockEqual = JSON.stringify(newMockClone) === JSON.stringify(existingMockClone);

      if (existingMock && isMockEqual) {
        continue;
      } else if (existingMock && options.mode === 'append') {
        this.all.push(new Mock(omit(mock, ['id'])));
      } else if (existingMock) {
        const updatedMock = assign({}, existingMock, mock);

        this.updateMock(existingMock.id, updatedMock);
      } else {
        this.all.push(new Mock(mock));
      }
    }

    PersistentStorage.persist();
  }

  recapture(mockIds, cb = () => {}) {
    const done = (id) => {
      PersistentStorage.persist();
      cb(id);
    };

    mockIds.forEach((mockId) => this.find({ id: mockId }).recapture(done));
  }

  toggleMock(mockId) {
    const mock = this.find({ id: mockId });

    if (!mock.active) {
      this.findAll({ requestHash: mock.requestHash }).forEach((mock) => mock.disable());
    }

    mock.toggle();

    PersistentStorage.persist();
  }

  export(arg) {
    if (isString(arg)) {
      return this.find({ id: arg }).export();
    }

    if (isArray(arg)) {
      return arg.map((mockId) => this.find({ id: mockId }).export());
    }

    return this.all.map((mock) => mock.export());
  }

  updateMock(mockId, request) {
    this.find({ id: mockId }).update(request);

    PersistentStorage.persist();
  }

  duplicateMock(mockId, overrides = {}) {
    const mock = this.find({ id: mockId });

    const duplicatedMock = {
      ...omit(mock, ['id']),
      name: mock.name ? `${mock.name} Copy` : mock.name,
      groupId: mock.groupId,
      ...overrides
    };

    this.mockRequest(duplicatedMock);
  }

  removeMock(mockId) {
    remove(this.all, { id: mockId });

    PersistentStorage.persist();
  }

  renameMock(mockId, newName) {
    this.find({ id: mockId }).rename(newName);

    PersistentStorage.persist();
  }

  getMatchingMocks(request) {
    const matches = [];

    for (let mock of this.all) {
      if (mock.matches({ url: request.url, params: request.body, method: request.method })) {
        matches.push(mock);
      }
    }

    return matches;
  }
}

export default new Mocks();
