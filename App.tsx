
<script src="http://192.168.0.168:8097"></script>
import { createDrawerNavigator, 
      } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import 'react-native-gesture-handler';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Animated, ImageBackground, StyleSheet, Text, View} from 'react-native';
// import { StatusBar } from 'expo-status-bar';
// import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Entypo } from '@expo/vector-icons'; 
import debounce from "lodash.debounce";


import { createApi } from "unsplash-js";

import { CustomDrawerContent } from './src/components/sideMenu/CustomDrawerContent';

import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
} from 'recoil';

import { slideChangeTime, topicsList, topicsIdsList } from './src/atoms/Slider';

import 'react-native-url-polyfill/auto';

const Drawer = createDrawerNavigator();

export function MainScreen({navigation}) {
  const unsplash = createApi({
    accessKey: process.env.UNSPLASH_ACCESS_KEY as string,
    headers: { "X-Custom-Header": "foo" },
  });

  const [image, setImage] = useState(null);
  const [image2, setImage2] = useState(null);

  const [user, setUser] = useState(null);
 
  const [showSettings, setShowSettings] = useState(false);
  const [slideChangeLabel, setSlideChangeLabel] = useState("1 min");
  const [imageTopicLabel, setImageTopicLabel] = useState(["All"]);


  const [slideInterval, setSlideInterval] = useRecoilState(slideChangeTime);
  const [topics, setTopicsList] = useRecoilState(topicsList);
  const [topicsIdList, setTopicsIdList] = useRecoilState(topicsIdsList);
  const [photoInfo, setPhotoInfo] = useState({});
  const [photoInfo2, setPhotoInfo2] = useState({});
  const [animValue, setAnimValue] = useState(1);

 

  var AnimatedImage = Animated.createAnimatedComponent(ImageBackground)


  let fadeAnim = useRef(new Animated.Value(1)).current;

  

    let isOdd = false;
    
    const onImage2Load = () => {
      const randomArguments = topicsIdList.length ? {topicIds: topicsIdList} : undefined
      console.log('this is arguments from image2load', randomArguments)
      if (!isOdd ) {
          isOdd = true
          console.log('is not odd')
          Animated.timing(
            fadeAnim,
            {
              toValue: 0,
              duration: 10000,
              useNativeDriver: true 
            }
          ).start()
          setTimeout((async () => {
            const imageResult = await unsplash.photos.getRandom(randomArguments);
            setImage2(imageResult.response.urls.full);
            setPhotoInfo2(imageResult.response.user);
          }), 10000)
      }
      else {
        isOdd = false
        console.log('is odd')
        Animated.timing(
          fadeAnim,
          {
            toValue: 1,
            duration: 10000,
            useNativeDriver: true 
          }
        ).start()
        setTimeout((async () => {
          const imageResult = await unsplash.photos.getRandom(randomArguments);
          setImage(imageResult.response.urls.full);
          setPhotoInfo(imageResult.response.user);
        }), 10000)
      }
     
    }



    const fetchData2 = async (randomArguments) => {
      isOdd = false
      const imageResult2 = await unsplash.photos.getRandom(randomArguments);
      setImage2(imageResult2.response.urls.full);
      setPhotoInfo2(imageResult2.response.user);
      Animated.timing(
        fadeAnim,
        {
          toValue: 1,
          duration: 1,
          useNativeDriver: true 
        }
      ).start()
      const imageResult = await unsplash.photos.getRandom(randomArguments);
      setImage(imageResult.response.urls.full)
      setPhotoInfo(imageResult.response.user);
    }
    
    const fetchImages = useCallback(
      debounce(list => {
        fetchData2(list)
      }, 2000),
      []
    );

    useEffect(() => {
      
      let intervalContainer: ReturnType<typeof setInterval>
      const randomArguments = topicsIdList.length ? {topicIds: topicsIdList} : undefined
      console.log("this is useEffect", randomArguments);
      fetchImages(randomArguments);
  
      intervalContainer = setInterval(onImage2Load, slideInterval);
      return () => clearInterval(intervalContainer);
    }, [slideInterval, topicsIdList]);  
  

  useEffect(() => {
    const fetchTopics = async () => {

      fadeAnim.addListener((item) => {
        if (animValue != Math.round(item.value))
        setAnimValue(Math.round(item.value))
      });
      // const imageResult2 = await unsplash.photos.getRandom(undefined);
      // setImage2(imageResult2.response.urls.full);
      // setPhotoInfo2(imageResult2.response.user);
      // const imageResult = await unsplash.photos.getRandom(undefined);
      // setImage(imageResult.response.urls.full)
      // setPhotoInfo(imageResult.response.user);
      const result = await unsplash.topics.list({
        page: 1,
        perPage: 50
      });
      if (result.response) {
        setTopicsList(result.response.results)
      }
    }
    fetchTopics().catch(console.error);
    // setSlideInterval(90000)
  }, []);

  
  const ButtonAction = () => {
    console.log('is clicked')
  }
  const handleNamePress = (url: string) => {
    if (animValue == 1) {
      Linking.openURL(`${photoInfo2.links.html}?utm_source=your_app_name&utm_medium=referral`);
    }
    else {
      Linking.openURL(`${photoInfo.links.html}?utm_source=your_app_name&utm_medium=referral`);
    }
    console.log('name is clicked')
  }

  const handleOriginPress = () => {
    Linking.openURL('https://unsplash.com/?utm_source=frume&utm_medium=referral');
    
    console.log('resource is clicked')
  }

  return (
    <>
      <Animated.Image  style={styles.mainImage} source={{uri: image}}>
      </Animated.Image>
      <Animated.Image   style={{...styles.mainImage, opacity: fadeAnim}} source={{uri: image2}}>
      </Animated.Image>
        <View style={styles.menuContainer}>
         
          {
            (animValue == 1) ?
             <View style={{ alignItems: 'flex-end', flexDirection: 'row', marginLeft: 20,  marginBottom: 50, height: '98%'}}>
                <Text style={styles.text1}> Photo by </Text>
                <Text style={styles.text_link} onPress={() => handleNamePress(photoInfo2.links.html)}>{photoInfo2.name}</Text>
                <Text style={styles.text1}> on </Text>
                <Text style={styles.text_link} onPress={handleOriginPress}>Unsplash</Text> 
             </View>
             :
             <View style={{ alignItems: 'flex-end', flexDirection: 'row', marginLeft: 20, marginBottom: 50, height: '98%'}}>
                <Text style={styles.text1}> Photo by </Text>
                <Text style={styles.text_link} onPress={() => handleNamePress(photoInfo.links.html)}>{photoInfo.name}</Text>
                <Text style={styles.text1}> on </Text>
                <Text style={styles.text_link} onPress={handleOriginPress}>Unsplash</Text> 
             </View>
          }

            <Entypo onPress={() => navigation.openDrawer()} style={styles.menuIcon} name="menu" size={28} color="black" />
        </View>
    </>
  );
}

export default function App() {
  return (
    <RecoilRoot>
      <NavigationContainer>
        <Drawer.Navigator 
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
              drawerPosition: 'right',
              drawerType: 'front',
            }}>
          <Drawer.Screen options={{headerShown: false}}  name="Feed" component={MainScreen} />
        </Drawer.Navigator>
      </NavigationContainer>
    </RecoilRoot>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  mainImage: {
    width: '100%',
    height: '100%',
    position: "absolute",
  },

  text1: {
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  text_link: {
    color: '#fff',
    textDecorationLine: 'underline',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },

  menuContainer: {
      width: '100%',
      color: '#fff',
      height: '100%',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      borderRadius: 8,
      flexDirection: 'row',
      backgroundColor: "rgba(65, 204, 151, 0)",
      position: "absolute",
      top:0,
      right: 0,
      zIndex: 5
  },

  menuIcon: {
    marginRight: 9,
    marginTop: 30,
    padding: 6,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  }
});
