import { Animated, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { Button, ButtonGroup} from '@rneui/themed';
import { createDrawerNavigator, 
         DrawerContentScrollView,
         DrawerItemList,
         DrawerItem
      } from '@react-navigation/drawer';


import React, { useRef, useState, useEffect } from 'react';

import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
} from 'recoil';

import { slideChangeTime, topicsList, topicsIdsList } from '../../atoms/Slider';


export function CustomDrawerContent(props) {

    const [topics, setTopicsList] = useRecoilState(topicsList);
    const [topicsIdList, setTopicsIdList] = useRecoilState(topicsIdsList);
    const [slideInterval, setSlideInterval] = useRecoilState(slideChangeTime);
    
    const computeSlideInterval = (value: number) => {
      switch(value) {
        case 0:
          return 60000;
        case 1:
          return 300000;
        case 2:
          return 600000;
        case 3:
          return 1800000;
        case 4:
          return 3600000;
        default:
          return 60000;
      }
    }

    
    const topicsLabels: string[] = []
    const topicsIds: number[] = []
      for (const [key, value] of Object.entries(topics)) {
        topicsLabels.push(value.title)
        topicsIds.push(value.id)
    }

    const Btn = 
      (props) => <View style={{backgroundColor: '#000000', alignSelf: 'flex-start' }}>
        <Text style={{color: '#ffffff'}}>
            props 
        </Text>
       </View>
    
    
    
    const [selectedIndex, setNewIntervalLabel] = useState(0);
    const [selectedTopics, setTopics] = useState([0]);
    return (
      <DrawerContentScrollView {...props}>
        {/* <DrawerItemList {...props} /> */}
        <View style={{marginLeft: 10, alignSelf: 'flex-start' }}>
          <Text style={{color: '#505050'}}>
              Slide interval
          </Text>
       </View>
        <ButtonGroup
        buttons={['1 min', '5 min', '10 min', '30 min', '1 hour']}
        textStyle={{fontSize: 15}}
        selectedButtonStyle={{backgroundColor: 'rgba(78, 116, 289, 1)'}}
        selectedIndex={selectedIndex}
        onPress={(value) => {
          setNewIntervalLabel(value)
          setSlideInterval(computeSlideInterval(value))
        }}
        containerStyle={{ marginBottom: 20 }}
      />
       <View style={{marginLeft: 10, alignSelf: 'flex-start' }}>
          <Text style={{color: '#505050'}}>
              Topics
          </Text>
       </View>
       <ButtonGroup
        buttons={['All', ...topicsLabels]}

        selectMultiple
        selectedIndexes={selectedTopics}
        onPress={(value, index) => {
          let newTopicsList: string[] = []
          
          if(value[value.length - 1] === 0 || value.length === 0) {
            setTopics([0]);
            setTopicsIdList([])
          }
          else if(value.includes(0)){
            setTopics(value.filter(topic => topic !== 0))
            value.forEach(id => {
              if (id !== 0) {
                newTopicsList.push(topicsIds[id - 1])
              }
            });
            console.log('this is new topics', newTopicsList)
            setTopicsIdList(newTopicsList)
          } else {
            value.forEach(id => {
              newTopicsList.push(topicsIds[id - 1])
            });
            console.log('this is new topics', newTopicsList)
            setTopicsIdList(newTopicsList)
            setTopics(value)
          }
        }}
        textStyle={{fontSize: 14}}
        selectedButtonStyle={{backgroundColor: 'rgba(78, 116, 289, 1)'}}
        
        buttonContainerStyle={{ minWidth: 148,   height: 40,  borderColor: '#e3e3e3', borderWidth: 1, }}
        innerBorderStyle={{width: 0}}
        containerStyle={{
            borderColor: '#fff',
           display: 'flex',  flexWrap: 'wrap', height: 530 }}
        
      />
      </DrawerContentScrollView>
    );
  }