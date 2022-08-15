import { atom } from 'recoil';

export const slideChangeTime = atom({
    key: 'slideChangeTime',
    default: 20000,
  });

  export const topicsList = atom({
    key: 'topicsList',
    default: {},
  });  

  export const topicsIdsList = atom({
    key: 'topicsIdsList',
    default: [],
  });  