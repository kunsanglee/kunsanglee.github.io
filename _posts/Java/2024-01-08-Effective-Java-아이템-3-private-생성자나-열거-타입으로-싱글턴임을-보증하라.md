---
title: "Effective Java - 아이템 3: private 생성자나 열거 타입으로 싱글턴임을 보증하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### 싱글턴(Singleton)

싱글턴이란 인스턴스를 오직 하나만 생성할 수 있는 클래스를 말한다.<br>
싱글턴의 전형적인 예로는 무상태(stateless) 객체나 설계상 유일해야 하는 시스템 컴포넌트를 들 수 있다.<br>
**그러나 클래스를 싱글턴으로 만들면 이를 사용하는 클라이언트를 테스트하기 어려워질 수 있다.**

### 싱글턴을 만드는 방식 3가지

> 공통점

1. 두 방식 모두 생성자는 private로 감춰둔다.
2. 유일한 인스턴스에 접근할 수 있는 수단으로 public static 멤버를 하나 마련해둔다.<br>

### 1. public 필드 방식의 싱글턴

```java
// public static final 필드 방식의 싱글턴
public class Elvis {
    public static final Elvis INSTANCE = new Elvis();

    private Elvis() {...}
    ...
}
```

> private 생성자는 public static final 필드 INSTANCE를 초기화할 때 딱 한 번만 호출된다.<br>
> public이나 protected 생성자가 없어서 Elvis 클래스가 초기화될 때 만들어진 인스턴스가 하나뿐임이 보장된다.<br>

단, 예외로 권한이 있는 클라이언트가 리플렉션 API인 AccessibleObject.setAccessible을 사용해<br>
private 생성자를 호출 할 수 있다.<br>
이런 공격을 방어하려면 생성자를 수정하여 두 번째 객체가 생성되려 할 때 예외를 던지게 하면 된다.<br>

```java
public class Elvis {
    public static final Elvis INSTANCE = new Elvis();
    private static int instanceCount = 0;

    private Elvis() {
        if (instanceCount != 0) { // 인스턴스가 생성될 때 카운트가 1 이상이면 예외를 던짐.
            throw new IllegalStatementException("Elvis 인스턴스는 한 개만 생성 가능.");
        }
        instanceCount++; // 인스턴스 생성시 카운트 증가.
        ...
    }
    ...
}
```

> public 필드 방식의 장점은 해당 클래스가 싱글턴임이 API에 명백히 드러난다는 것과 간결한 점이다.

### 2. 정적 팩터리 메서드를 public static 멤버로 제공하는 방식의 싱글턴

```java
public class Elvis {
    private static final Elvis INSTANCE = new Elvis();

    private Elvis() {
        if (instanceCount != 0) { // 인스턴스가 생성될 때 카운트가 1 이상이면 예외를 던짐.
            throw new IllegalStatementException("Elvis 인스턴스는 한 개만 생성 가능.");
        }
        instanceCount++; // 인스턴스 생성시 카운트 증가.
        ...
    }

    public static Elvis getInstance() {
        return INSTANCE;
    }
    ...
}
```

Elvis.getInstance는 항상 같은 객체의 참조를 반환한다.
> 정적 팩터리 방식의 첫 번째 장점은 API를 바꾸지 않고도 싱글턴이 아니게 변경할 수 있다는 점이다.<br>
> 두 번째 장점은 정적 팩터리를 제네릭 싱글턴 팩터리롤 만들 수 있다는 점이다.<br>
> 세 번째 장점은 정적 팩터리의 메서드 참조를 공급자(supplier)로 사용할 수 있다는 점이다.<br>

1. API를 변경하지 않고도 싱글턴이 아니게 변경하는 예
```java
public class Singleton {
     private static Singleton instance;
     private Singleton() { }

     public static synchronized Singleton getInstance() {
         if (instance == null) {
             instance = new Singleton();
         }
         return instance;
     }
}
```
위의 코드는 싱글턴이 아닌 **늦은 초기화(lazy initialization)**를 사용한 코드이다.<br>
`getInstance()` 메서드가 호출될 때 싱글턴 인스턴스가 생성된다. <br>
이렇게 하면 필요할 때만 인스턴스를 생성하므로 리소스를 절약할 수 있다.<br>

2. 제네릭 싱글 팩터리 예
```java
public class GenericSingletonFactory {
    private static GenericSingletonFactory instance;

    private GenericSingletonFactory() { }

    public static synchronized <T> GenericSingletonFactory getInstance() {
        if (instance == null) {
            instance = new GenericSingletonFactory();
        }
        return instance;
    }
}
```


3. 메서드 참조를 공급자(supplier)로 사용하는 예
```java
public class Main {
    public static void main(String[] args) {
        Supplier<Singleton> singletonSupplier = Singleton::getInstance;
        Singleton singleton = singletonSupplier.get();
    }
}
```
Java 8 이상에서는 **메서드 참조를 사용하여 공급자(supplier)**를 만들 수 있다.<br>
이 예에서는 `Singleton::getInstance` 메서드 참조를 사용하여 `singletonSupplier`를 만들었다.<br> 
`get()` 메서드를 호출하면 `Singleton.getInstance()`가 호출되어 싱글턴 인스턴스를 반환한다.<br>

싱글턴 클래스를 직렬화하려면 Serializable을 구현하는 것 만으로는 부족하다.<br>
모든 인스턴스 필드를 일시적(transient)으로 선언하고 readResolve 메서드를 제공해야 한다.<br>
이렇게 하지 않으면 직렬화된 인스턴스를 역직렬화 할 때 마다 새로운 인스턴스가 만들어진다.<br>

### 3. 원소가 하나인 열거 타입을 선언하는 방식

```java
// 원소가 하나뿐인 enum 사용
public enum Elvis {
    INSTANCE;
    
    ...
}
```

대부분 상황에서는 원소가 하나뿐인 열거 타입이 싱글턴을 만드는 가장 좋은 방법이다.<br>
단, 만들려는 싱글턴이 Enum 외의 클래스를 상속해야 한다면 이 방법은 사용할 수 없다<br>
(열거 타입이 다른 인터페이스를 구현하도록 선언할 수는 있다).
