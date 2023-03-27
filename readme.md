JavaScript Kexxu Eye Client
===

Library to connect the browser to the real-time output of the Kexxu eye trackers.

Supports: Kexxu Eye, Kexxu Game Eye.


# How to use

Import into you project

```
import KexxuEye from 'kexxu-eye-client-js';
```

Init and connect

```
kexxuEye = new KexxuEye.KexxuEye( <DEVICE_ID>, <DEVICE_LOCAL_IP>);
kexxuEye.connect();
```

Calibrate

```
kexxuEye.calibration2.bx += 10; // move center
kexxuEye.calibration2.by += 10; // move center


kexxuEye.calibration2.ax -= 0.02; // change sensitivity
kexxuEye.calibration2.ay -= 0.02; // change sensitivity
```


# TODO

- Get the ip address automatically
- Automatically add the html elements to the page
- Different settings for Kexxu Eye and Kexxu Game Eye
- Calibration tool
