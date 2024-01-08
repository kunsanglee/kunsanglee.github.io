---
title: "Effective Java - 아이템 4: 인스턴스화를 막으려거든 private 생성자를 사용하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

정적 멤버만 담은 유틸리티 클래스는 인스턴스로 만들어 쓰려고 설계한게 아니다.<br>
**하지만 생성자를 명시하지 않으면(직접 작성한 생성자가 하나도 없는 경우) 컴파일러가 자동으로 기본 생성자를 만들어준다.**<br>
**사용자는 이 생성자가 자동 생성된 것인지 구분할 수 없다.**<br>
```java
// 인스턴스로 만들 의도가 없는 유틸리티 클래스
public class MyUtility {
    
    // 생성자가 하나도 없기 때문에 컴파일러가 기본 생성자를 만든다.
    // public MyUtility() {}
    
    public static void printHello() {
        System.out.println("Hello");
    }
}
```

>추상 클래스로 만드는 것으로는 인스턴스화를 막을 수 없다.<br>
하위 클래스를 만들어 인스턴스화할 수 있다.<br>

```java
public abstract class Super {
    
}

public class Sub extends Super {
    
    // 상속받은 하위 클래스에서 생성할 수 있다.
    // public Sub() { super(); }
}
```

### 인스턴스화를 막는 방법

```java
public class UtilityClass {
    // 기본 생성자가 만들어지는 것을 막는다(인스턴스 방지용).
    private UtilityClass() {
        throw new AssertionError(); // 클래스 안에서 실수로라도 생성자를 호출하지 않도록 해준다.
    }
}
```

>생성자의 접근자를 private로 만드는 방식은 해당 클래스를 상속 불가능하게 만드는 효과도 있다.<br>
해당 클래스를 상속하는 하위 클래스에서 상위 클래스의 생성자 super()를 호출해야 하는데,<br>
상위 클래스가 가진 생성자의 접근 제어자가 private이기 때문에 상위 클래스의 생성자에 접근할 수 없기 때문이다.<br>
