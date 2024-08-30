---
title: "String, StringBuffer, StringBuilder"
categories:
  - Java
tags:
  - String
  - StringBuffer
  - StringBuilder
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### String

`String` 클래스는 불변(Immutable)한 문자열을 나타낸다. 한 번 문자열 리터럴이 생성되면 수정할 수 없다. Java에서는 *String Constant Pool* 또는 상수풀(*Constant Pool*)이라고 하는 문자열 리터럴을 관리하는 특별한 메모리 영역으로, JVM 내부에 존재하며 문자열 리터럴을 저장하고 재사용하는 역할을 한다.

>*문자열 리터럴이란?*<br>
> 문자열 리터럴은 소스코드에서 문자열 값을 표현하는 고정된 문자열이다.

![StringPool.png](/image/for-post/StringPool.png)

### Constant Pool의 특징
1. 문자열 리터럴의 재사용: Constant Pool은 리터럴을 중복하여 생성하지 않도록 하나의 인스턴스로 관리한다. 동일한 문자열을 참조하면 결국 같은 인스턴스를 참조하게 된다.
2. 불변성: 문자열 리터럴은 불변하여 수정할 수 없다. 문자열을 변하려고 하면 새로운 문자열을 생성한다.
3. 메모리 절약: Constant Pool에 이미 저장되어있는 리터럴이 있다면 새로 생성하지 않고 기존의 문자열을 사용하여 메모리를 절약한다.


```java
String str = "Hello, ";
str += "world!"; // 새로운 문자열 생성.
// 현재 Constant Pool에는 "Hello, "와 "Hello, world!" 두 리터럴이 저장되어있다.
String a = "A"; // Constant Pool에 "A" 추가.
String b = "A"; // 이미 상수 풀에 저장된 "A" 문자열을 참조한다.
System.out.println(a == b); // 같은 문자열을 참조하고 있기 때문에 true.
```

<br>

*Constant Pool에 저장되는 리터럴과 new 연산자를 사용한 String 객체는 차이가 있다*<br>
>리터럴은 상수 문자열(constant strings)로 취급되어 상수풀에 저장되지만, new 연산자를 사용하여 문자열 객체를 생성하면 리터럴이 아닌 새로운 문자열 객체를 생성하게 되어 Heap영역에 저장된다. 상수 풀을 사용하면 문자열의 비교 및 메모리 관리가 효율적으로 이루어지므로 문자열 리터럴을 많이 사용하는 경우 성능 및 메모리 효율성을 향상시킬 수 있다.

```java
String str1 = "string"; // Constant Pool에 문자열 리터럴로 저장.
String str2 = new String("string"); // heap 영역에 String 객체로 저장.
System.out.println(str1 == str2); // false, 둘은 참조가 다르다.
```

### StringBuffer, StringBuilder

StringBuffer와 StringBuilder는 String과 달리 가변객체(Mutable)이므로 수정이 가능하다.
또한 잦은 문자열 수정이 필요할 때 불변객체인 String을 사용하면 새로운 리터럴 문자열이 계속해서 Constant Pool에 생성되지만, 가변객체를 사용하여 문자열을 수정하면 새로 생성하지 않고 기존 객체가 수정되기 때문에 불변객체의 단점을 극복할 수 있다. 

- *StringBuffer → 동기화를 지원 O. multi-thread 환경에서 thread-safe.*
- *StringBuilder → 동기화를 지원 X. Not thread-safe, single-thread 환경에서 성능이 StringBuffer보다 좋음.*
- *StringBuffer, StringBuilder는 heap영역에 저장된다.*
<br>

```java
// StringBuffer
StringBuffer buffer = new StringBuffer("Hello, ");
buffer.append("world!"); // 기존 객체를 수정

// StringBuilder
StringBuilder builder = new StringBuilder("Hello, ");
builder.append("world!"); // 기존 객체를 수정
```

또한 StringBuffer와 StringBuilder는 `append()` 메서드는 StringBuffer, StringBuilder 자체를 반환하기 때문에
여러 메서드 호출을 연쇄적으로 할 수 있고 문자열을 동적으로 생성하고 조작할 수 있다. 

---

### 불변(Immutable)객체란?

객체 생성 이후에는 객체의 상태가 바뀌지 않는 객체.

*장점*
1. 이해하기 쉽고 안정적인 서비스 개발에 도움이 된다.
2. map, set, cache에 쓰기 적절.(객체의 중복제거)
3. (일반적으로) Thread-safe.
4. 불변 객체를 필드로 쓰면 방어적 복사를 할 필요가 없다.


*어떤 클래스를 불변(immutable)으로 만들고 싶다면?*
- 상태 변경 메서드 제거
- 모든 필드 private final 지정
- 클래스 상속 금지(class에 final)
- Mutable 객체의 레퍼런스 공유 금지

만약 불변 객체로 선언한 필드를 가변적으로 사용하려면 mutable객체의 레퍼런스를 공유해서 사용하지 않고
방어적 복사를 활용해서 새로운 객체를 반환하면 가능.
