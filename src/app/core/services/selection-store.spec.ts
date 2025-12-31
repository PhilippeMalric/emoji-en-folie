import { TestBed } from '@angular/core/testing';

import { SelectionStore } from './selection-store';

describe('SelectionStore', () => {
  let service: SelectionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SelectionStore);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
